import type { LightningAdapter, LightningInvoice, PreparedLightningPayment } from './lightning';
import { assertSafeNwcPolicy, parseNwcUri, SAFE_NWC_POLICY } from './nwc';

export interface NwcInvoiceRecord {
  invoice?: string;
  payment_hash?: string;
  state?: string;
  amount?: number;
}

export interface NwcWalletInfo {
  alias?: string;
  network?: string;
  methods?: string[];
}

export interface NwcClientLike {
  getInfo(): Promise<NwcWalletInfo>;
  makeInvoice(args: { amount: number; description?: string }): Promise<NwcInvoiceRecord>;
  lookupInvoice(args: { payment_hash?: string; invoice?: string }): Promise<NwcInvoiceRecord>;
  close?(): void;
}

const REQUIRED_METHODS = ['get_info', 'make_invoice', 'lookup_invoice'] as const;
const OUTGOING_METHODS = new Set([
  'pay_invoice',
  'pay_keysend',
  'multi_pay_invoice',
  'multi_pay_keysend',
]);

export interface NwcReceiveConnectionInfo {
  alias?: string;
  network?: string;
  methods: string[];
  walletPubkey: string;
  relays: string[];
}

export function assertReceiveOnlyNwcMethods(methods: readonly string[]): void {
  const normalized = new Set(methods.map((method) => method.trim().toLowerCase()).filter(Boolean));
  for (const required of REQUIRED_METHODS) {
    if (!normalized.has(required)) throw new Error(`NWC permission missing: ${required}`);
  }
  const dangerous = [...normalized].filter((method) => OUTGOING_METHODS.has(method));
  if (dangerous.length > 0) {
    throw new Error(`NWC connection is not receive-only; remove outgoing permission(s): ${dangerous.join(', ')}`);
  }
}

export async function createSdkNwcClient(uri: string): Promise<NwcClientLike> {
  parseNwcUri(uri);
  const sdk = await import('@getalby/sdk');
  const Client = sdk.NWCClient;
  if (!Client) throw new Error('NWC client unavailable');
  return new Client({ nostrWalletConnectUrl: uri }) as unknown as NwcClientLike;
}

interface StoredInvoice {
  invoice: LightningInvoice;
  paymentHash?: string;
}

export class NwcReceiveOnlyAdapter implements LightningAdapter {
  private readonly invoices = new Map<string, StoredInvoice>();

  private constructor(
    private readonly client: NwcClientLike,
    readonly connection: NwcReceiveConnectionInfo,
  ) {}

  static async connect(uri: string, clientFactory: (uri: string) => Promise<NwcClientLike> = createSdkNwcClient): Promise<NwcReceiveOnlyAdapter> {
    assertSafeNwcPolicy(SAFE_NWC_POLICY);
    const descriptor = parseNwcUri(uri);
    const client = await clientFactory(uri);
    try {
      const info = await client.getInfo();
      const methods = info.methods ?? [];
      assertReceiveOnlyNwcMethods(methods);
      return new NwcReceiveOnlyAdapter(client, {
        alias: info.alias,
        network: info.network,
        methods,
        walletPubkey: descriptor.walletPubkey,
        relays: descriptor.relays,
      });
    } catch (error) {
      client.close?.();
      throw error;
    }
  }

  async createInvoice(sats: number, memo = 'NOIOU buy-in'): Promise<LightningInvoice> {
    if (!Number.isInteger(sats) || sats <= 0) throw new Error('Invoice amount must be positive integer sats');
    const record = await this.client.makeInvoice({ amount: sats * 1000, description: memo });
    if (!record.invoice?.trim()) throw new Error('NWC wallet did not return a BOLT11 invoice');
    const id = record.payment_hash?.trim() || crypto.randomUUID();
    const invoice: LightningInvoice = {
      id,
      request: record.invoice,
      sats,
      status: this.mapState(record.state),
      source: 'NWC',
    };
    this.invoices.set(id, { invoice, paymentHash: record.payment_hash });
    return invoice;
  }

  restoreInvoice(invoice: LightningInvoice): void {
    if (invoice.source !== 'NWC') throw new Error('Only NWC invoices can be restored in the NWC adapter');
    this.invoices.set(invoice.id, { invoice: { ...invoice }, paymentHash: /^[0-9a-f]{64}$/i.test(invoice.id) ? invoice.id : undefined });
  }

  async getInvoiceStatus(id: string): Promise<LightningInvoice['status']> {
    const stored = this.invoices.get(id);
    if (!stored) throw new Error('Unknown NWC invoice; reconnect and restore the session invoice first');
    const record = await this.client.lookupInvoice(stored.paymentHash
      ? { payment_hash: stored.paymentHash }
      : { invoice: stored.invoice.request });
    const status = this.mapState(record.state);
    stored.invoice = { ...stored.invoice, status };
    if (record.payment_hash) stored.paymentHash = record.payment_hash;
    return status;
  }

  async preparePayment(_destination: string, _sats: number): Promise<PreparedLightningPayment> {
    throw new Error('Outgoing NWC payments are disabled by NOIOU receive-only policy');
  }

  async confirmPreparedPayment(_id: string): Promise<PreparedLightningPayment> {
    throw new Error('Outgoing NWC payments are disabled by NOIOU receive-only policy');
  }

  close(): void {
    this.client.close?.();
    this.invoices.clear();
  }

  private mapState(state?: string): LightningInvoice['status'] {
    switch (state?.toLowerCase()) {
      case 'settled': return 'PAID';
      case 'expired': return 'EXPIRED';
      default: return 'PENDING';
    }
  }
}
