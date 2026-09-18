import { describe, expect, it } from 'vitest';
import { t } from './i18n';
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

  it('restores a pending invoice after a local session reload', async () => {
    const adapter = new MockLightningAdapter([{ id: 'inv-1', request: 'lnmock:inv-1:321:test', sats: 321, status: 'PENDING' }]);
    expect(await adapter.getInvoiceStatus('inv-1')).toBe('PENDING');
    adapter.markInvoicePaid('inv-1');
    expect(await adapter.getInvoiceStatus('inv-1')).toBe('PAID');
  });

  it('rejects invalid invoice and payment amounts', async () => {
    const adapter = new MockLightningAdapter();
    await expect(adapter.createInvoice(0)).rejects.toThrow(t('error.invoiceAmountPositiveInteger'));
    await expect(adapter.createInvoice(1.5)).rejects.toThrow(t('error.invoiceAmountPositiveInteger'));
    await expect(adapter.preparePayment('alice@example.test', -1)).rejects.toThrow(t('error.paymentAmountPositiveInteger'));
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
