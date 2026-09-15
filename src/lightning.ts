export type LightningInvoiceSource = 'MOCK' | 'NWC' | 'MANUAL_EXTERNAL';

export interface LightningInvoice {
  id: string;
  request: string;
  sats: number;
  status: 'PENDING' | 'PAID' | 'EXPIRED';
  source?: LightningInvoiceSource;
  /** Human-readable NOIOU trace shown next to the QR, never a wallet secret. */
  traceLabel?: string;
  /** Why automatic exact-invoice preparation could not be completed. */
  preparationError?: string;
  /** How an exact request was obtained. */
  preparedBy?: 'NWC' | 'LNURL_PAY' | 'MANUAL_BOLT11' | 'MOCK';
}

export interface PreparedLightningPayment {
  id: string;
  destination: string;
  sats: number;
  status: 'PREPARED' | 'CONFIRMED';
}

export interface LightningAdapter {
  createInvoice(sats: number, memo?: string): Promise<LightningInvoice>;
  getInvoiceStatus(id: string): Promise<LightningInvoice['status']>;
  preparePayment(destination: string, sats: number): Promise<PreparedLightningPayment>;
  confirmPreparedPayment(id: string): Promise<PreparedLightningPayment>;
}

export class MockLightningAdapter implements LightningAdapter {
  private invoices = new Map<string, LightningInvoice>();
  private payments = new Map<string, PreparedLightningPayment>();

  constructor(initialInvoices: readonly LightningInvoice[] = []) {
    for (const invoice of initialInvoices) this.restoreInvoice(invoice);
  }

  restoreInvoice(invoice: LightningInvoice): void {
    if (!invoice.id.trim() || !Number.isInteger(invoice.sats) || invoice.sats <= 0) throw new Error('Invalid mock invoice snapshot');
    if (invoice.source && invoice.source !== 'MOCK') throw new Error('Only mock invoices can be restored in MockLightningAdapter');
    this.invoices.set(invoice.id, { ...invoice, source: 'MOCK' });
  }

  async createInvoice(sats: number, memo = 'NOIOU buy-in'): Promise<LightningInvoice> {
    if (!Number.isInteger(sats) || sats <= 0) throw new Error('Invoice amount must be positive integer sats');
    const id = crypto.randomUUID();
    const invoice: LightningInvoice = {
      id,
      request: `lnmock:${id}:${sats}:${encodeURIComponent(memo)}`,
      sats,
      status: 'PENDING',
      source: 'MOCK',
      traceLabel: memo,
      preparedBy: 'MOCK',
    };
    this.invoices.set(id, invoice);
    return invoice;
  }

  async getInvoiceStatus(id: string): Promise<LightningInvoice['status']> {
    const invoice = this.invoices.get(id);
    if (!invoice) throw new Error('Unknown invoice');
    return invoice.status;
  }

  markInvoicePaid(id: string): void {
    const invoice = this.invoices.get(id);
    if (!invoice) throw new Error('Unknown invoice');
    this.invoices.set(id, { ...invoice, status: 'PAID' });
  }

  async preparePayment(destination: string, sats: number): Promise<PreparedLightningPayment> {
    if (!destination.trim()) throw new Error('Destination is required');
    if (!Number.isInteger(sats) || sats <= 0) throw new Error('Payment amount must be positive integer sats');
    const id = crypto.randomUUID();
    const payment: PreparedLightningPayment = { id, destination, sats, status: 'PREPARED' };
    this.payments.set(id, payment);
    return payment;
  }

  async confirmPreparedPayment(id: string): Promise<PreparedLightningPayment> {
    const payment = this.payments.get(id);
    if (!payment) throw new Error('Unknown prepared payment');
    if (payment.status === 'CONFIRMED') return payment;
    const confirmed = { ...payment, status: 'CONFIRMED' as const };
    this.payments.set(id, confirmed);
    return confirmed;
  }
}
