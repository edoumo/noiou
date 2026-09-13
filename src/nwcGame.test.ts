import { describe, expect, it } from 'vitest';
import { assertLiveGameInvoiceAmount, MAX_LIVE_GAME_INVOICE_SATS } from './NwcSessionContext';

describe('live NWC game invoice guard', () => {
  it('accepts a normal private-alpha buy-in amount', () => {
    expect(() => assertLiveGameInvoiceAmount(20_000)).not.toThrow();
  });

  it('rejects zero, fractional and oversized invoices', () => {
    expect(() => assertLiveGameInvoiceAmount(0)).toThrow(/positif/i);
    expect(() => assertLiveGameInvoiceAmount(12.5)).toThrow(/entier/i);
    expect(() => assertLiveGameInvoiceAmount(MAX_LIVE_GAME_INVOICE_SATS + 1)).toThrow(/sécurité/i);
  });
});
