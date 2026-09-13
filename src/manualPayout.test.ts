import { describe, expect, it } from 'vitest';
import { buildManualLightningPayout, payoutAmountToSats } from './manualPayout';

describe('manual Lightning payout instructions', () => {
  it('keeps SATS payouts exact', () => {
    expect(payoutAmountToSats(2500, 'SATS')).toBe(2500);
  });

  it('converts fiat using the game-locked BTC/fiat rate', () => {
    expect(payoutAmountToSats(25, 'EUR', 100_000)).toBe(25_000);
  });

  it('rejects missing or invalid destinations and rates', () => {
    expect(() => buildManualLightningPayout({ label: 'Alice', destination: ' ', amount: 1000, currency: 'SATS' })).toThrow(/destination/i);
    expect(() => payoutAmountToSats(10, 'EUR')).toThrow(/taux/i);
    expect(() => payoutAmountToSats(1.5, 'SATS')).toThrow(/entier/i);
  });

  it('builds a copyable instruction with beneficiary, sats and destination', () => {
    const instruction = buildManualLightningPayout({
      label: 'Alice',
      destination: 'alice@example.com',
      amount: 20,
      currency: 'EUR',
      lockedBtcFiatRate: 80_000,
    });

    expect(instruction.sats).toBe(25_000);
    expect(instruction.summary).toContain('Alice');
    expect(instruction.summary).toContain('25');
    expect(instruction.summary).toContain('alice@example.com');
  });
});
