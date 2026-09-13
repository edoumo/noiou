import { describe, expect, it } from 'vitest';
import { MockLightningAdapter } from './lightning';

describe('MockLightningAdapter', () => {
  it('creates a pending invoice and observes payment', async () => {
    const adapter = new MockLightningAdapter();
    const invoice = await adapter.createInvoice(1234, 'test');
    expect(invoice.status).toBe('PENDING');
    expect(await adapter.getInvoiceStatus(invoice.id)).toBe('PENDING');
    adapter.markInvoicePaid(invoice.id);
    expect(await adapter.getInvoiceStatus(invoice.id)).toBe('PAID');
  });

  it('rejects invalid invoice and payment amounts', async () => {
    const adapter = new MockLightningAdapter();
    await expect(adapter.createInvoice(0)).rejects.toThrow(/positive integer/);
    await expect(adapter.createInvoice(1.5)).rejects.toThrow(/positive integer/);
    await expect(adapter.preparePayment('alice@example.test', -1)).rejects.toThrow(/positive integer/);
  });

  it('prepares and confirms a payment idempotently', async () => {
    const adapter = new MockLightningAdapter();
    const prepared = await adapter.preparePayment('alice@example.test', 500);
    expect(prepared.status).toBe('PREPARED');
    const confirmed = await adapter.confirmPreparedPayment(prepared.id);
    const confirmedAgain = await adapter.confirmPreparedPayment(prepared.id);
    expect(confirmed.status).toBe('CONFIRMED');
    expect(confirmedAgain).toEqual(confirmed);
  });
});
