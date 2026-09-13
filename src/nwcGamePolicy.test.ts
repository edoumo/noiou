import { describe, expect, it } from 'vitest';
import { assertRealNwcGameCurrency, REAL_NWC_ALPHA_CURRENCY } from './NwcSessionContext';

describe('real NWC alpha currency policy', () => {
  it('allows SATS games', () => {
    expect(REAL_NWC_ALPHA_CURRENCY).toBe('SATS');
    expect(() => assertRealNwcGameCurrency('SATS')).not.toThrow();
  });

  it.each(['EUR', 'USD', undefined])('blocks %s for real game receipts', (currency) => {
    expect(() => assertRealNwcGameCurrency(currency)).toThrow(/uniquement.*SATS/i);
  });
});
