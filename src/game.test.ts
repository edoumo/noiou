import { describe, expect, it } from 'vitest';
import { t } from './i18n';
import type { Game, Payout, SettlementResult } from './domain';
import { checkGameClosure, confirmCashContribution, confirmLightningContribution, confirmPayout, createContribution, markContributionPending } from './game';

function game(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1', currency: 'EUR', buyInAmount: 20, rebuyEnabled: true, rebuyAmount: 20,
    chipValue: 1, status: 'OPEN', dealer: { enabled: false, mode: 'NONE' },
    createdAt: '2026-09-13T00:00:00Z', ...overrides,
  };
}

function settlement(overrides: Partial<SettlementResult> = {}): SettlementResult {
  return {
    balanced: true,
    issuedChips: 40,
    countedChips: 40,
    chipDifference: 0,
    distributableAmount: 40,
    dealerCompensation: 0,
    payouts: [
      { playerId: 'a', amount: 30, method: 'CASH', status: 'PENDING' },
      { playerId: 'b', amount: 10, method: 'LIGHTNING', status: 'PENDING' },
    ],
    ...overrides,
  };
}

describe('game contribution guards', () => {
  it('confirms cash only once and remains idempotent', () => {
    const contribution = createContribution(game(), 'a', 'BUYIN', 'CASH', 'c1', '2026-09-13T00:00:00Z');
    const once = confirmCashContribution([contribution], 'c1', '2026-09-13T00:01:00Z');
    const twice = confirmCashContribution(once, 'c1', '2026-09-13T00:02:00Z');
    expect(twice[0].status).toBe('PAID');
    expect(twice[0].paidAt).toBe('2026-09-13T00:01:00Z');
  });

  it('rejects a duplicate Lightning invoice reference', () => {
    const first = createContribution(game(), 'a', 'BUYIN', 'LIGHTNING', 'c1');
    const second = createContribution(game(), 'b', 'BUYIN', 'LIGHTNING', 'c2');
    const pending = markContributionPending([first, second], 'c1', 'inv-1');
    expect(() => markContributionPending(pending, 'c2', 'inv-1')).toThrow(t('error.externalReferenceUsed'));
  });

  it('confirms Lightning payment idempotently for the same invoice', () => {
    const contribution = createContribution(game(), 'a', 'BUYIN', 'LIGHTNING', 'c1');
    const pending = markContributionPending([contribution], 'c1', 'inv-1');
    const once = confirmLightningContribution(pending, 'c1', 'inv-1', '2026-09-13T00:01:00Z');
    const twice = confirmLightningContribution(once, 'c1', 'inv-1', '2026-09-13T00:02:00Z');
    expect(twice[0].paidAt).toBe('2026-09-13T00:01:00Z');
  });

  it('blocks rebuys when disabled', () => {
    expect(() => createContribution(game({ rebuyEnabled: false }), 'a', 'REBUY', 'CASH')).toThrow(t('error.rebuysDisabled'));
  });
});

describe('game closure guards', () => {
  it('blocks closure until every non-zero payout is confirmed', () => {
    const result = settlement();
    let payouts: Payout[] = result.payouts;
    expect(checkGameClosure(result, payouts, true).allowed).toBe(false);
    payouts = confirmPayout(payouts, 'a');
    expect(checkGameClosure(result, payouts, true).allowed).toBe(false);
    payouts = confirmPayout(payouts, 'b');
    expect(checkGameClosure(result, payouts, true).allowed).toBe(true);
  });

  it('blocks closure until dealer compensation is confirmed', () => {
    const result = settlement({ dealerCompensation: 4, distributableAmount: 36, payouts: [] });
    expect(checkGameClosure(result, [], false).allowed).toBe(false);
    expect(checkGameClosure(result, [], true).allowed).toBe(true);
  });
});
