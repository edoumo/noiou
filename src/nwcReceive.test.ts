import { describe, expect, it, vi } from 'vitest';
import {
  assertReceiveOnlyNwcMethods,
  NwcReceiveOnlyAdapter,
  type NwcClientLike,
} from './nwcReceive';

const uri = `nostr+walletconnect://${'1'.repeat(64)}?relay=${encodeURIComponent('wss://relay.example')}&secret=${'2'.repeat(64)}`;

function fakeClient(overrides: Partial<NwcClientLike> = {}): NwcClientLike {
  return {
    getInfo: vi.fn(async () => ({ alias: 'Test wallet', network: 'regtest', methods: ['get_info', 'make_invoice', 'lookup_invoice'] })),
    makeInvoice: vi.fn(async ({ amount }) => ({
      invoice: 'lnbcrt1testinvoice',
      payment_hash: 'a'.repeat(64),
      state: 'pending',
      amount,
    })),
    lookupInvoice: vi.fn(async () => ({
      invoice: 'lnbcrt1testinvoice',
      payment_hash: 'a'.repeat(64),
      state: 'settled',
      amount: 123_000,
    })),
    close: vi.fn(),
    ...overrides,
  };
}

describe('receive-only NWC policy', () => {
  it('accepts only the required receive-side methods', () => {
    expect(() => assertReceiveOnlyNwcMethods(['get_info', 'make_invoice', 'lookup_invoice'])).not.toThrow();
  });

  it('rejects a connection that can pay', () => {
    expect(() => assertReceiveOnlyNwcMethods(['get_info', 'make_invoice', 'lookup_invoice', 'pay_invoice']))
      .toThrow(/not receive-only/i);
  });

  it('rejects missing invoice lookup permission', () => {
    expect(() => assertReceiveOnlyNwcMethods(['get_info', 'make_invoice']))
      .toThrow(/lookup_invoice/);
  });
});

describe('NwcReceiveOnlyAdapter', () => {
  it('creates a real-NWC invoice in millisats and marks it paid only after lookup says settled', async () => {
    const client = fakeClient();
    const adapter = await NwcReceiveOnlyAdapter.connect(uri, async () => client);
    const invoice = await adapter.createInvoice(123, 'NOIOU test');

    expect(client.makeInvoice).toHaveBeenCalledWith({ amount: 123_000, description: 'NOIOU test' });
    expect(invoice).toMatchObject({
      id: 'a'.repeat(64),
      request: 'lnbcrt1testinvoice',
      sats: 123,
      status: 'PENDING',
      source: 'NWC',
    });

    await expect(adapter.getInvoiceStatus(invoice.id)).resolves.toBe('PAID');
  });

  it('can restore a persisted public invoice after reconnect without persisting the NWC secret', async () => {
    const firstClient = fakeClient();
    const first = await NwcReceiveOnlyAdapter.connect(uri, async () => firstClient);
    const invoice = await first.createInvoice(123, 'NOIOU game buy-in');
    first.close();

    const secondClient = fakeClient();
    const reconnected = await NwcReceiveOnlyAdapter.connect(uri, async () => secondClient);
    reconnected.restoreInvoice(invoice);

    await expect(reconnected.getInvoiceStatus(invoice.id)).resolves.toBe('PAID');
    expect(secondClient.lookupInvoice).toHaveBeenCalledWith({ payment_hash: 'a'.repeat(64) });
  });

  it('hard-blocks every outgoing payment path', async () => {
    const adapter = await NwcReceiveOnlyAdapter.connect(uri, async () => fakeClient());
    await expect(adapter.preparePayment('lnbc1...', 100)).rejects.toThrow(/disabled/i);
    await expect(adapter.confirmPreparedPayment('anything')).rejects.toThrow(/disabled/i);
  });

  it('closes a rejected over-privileged connection', async () => {
    const client = fakeClient({
      getInfo: vi.fn(async () => ({ methods: ['get_info', 'make_invoice', 'lookup_invoice', 'pay_invoice'] })),
    });
    await expect(NwcReceiveOnlyAdapter.connect(uri, async () => client)).rejects.toThrow(/not receive-only/i);
    expect(client.close).toHaveBeenCalledOnce();
  });
});
