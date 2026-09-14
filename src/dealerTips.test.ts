import { describe, expect, it } from 'vitest';
import type { Game } from './domain';
import { createDealerTip } from './dealerTips';

function game(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    currency: 'EUR',
    buyInAmount: 20,
    rebuyEnabled: true,
    rebuyAmount: 20,
    chipValue: 1,
    status: 'CLOSED',
    dealer: { enabled: true, mode: 'NONE', label: 'Dealer', lightningAddress: 'dealer@example.com' },
    lockedBtcFiatRate: 100_000,
    createdAt: '2026-09-14T00:00:00Z',
    ...overrides,
  };
}

describe('dealer tips', () => {
  it('records a voluntary cash tip outside settlement accounting', () => {
    const tip = createDealerTip(game(), 'alice', 2.5, 'CASH', 'tip1', '2026-09-14T01:00:00Z');
    expect(tip).toMatchObject({ id: 'tip1', playerId: 'alice', amount: 2.5, currency: 'EUR', method: 'CASH' });
    expect(tip.sats).toBeUndefined();
  });

  it('keeps SATS tips integer and exact', () => {
    const tip = createDealerTip(game({ currency: 'SATS', lockedBtcFiatRate: undefined }), 'alice', 500, 'LIGHTNING', 'tip2');
    expect(tip.amount).toBe(500);
    expect(tip.sats).toBe(500);
    expect(() => createDealerTip(game({ currency: 'SATS' }), 'alice', 1.5, 'CASH')).toThrow(/entier/);
  });

  it('requires a closed game and a dealer', () => {
    expect(() => createDealerTip(game({ status: 'SETTLING' }), 'alice', 1, 'CASH')).toThrow(/clôture/);
    expect(() => createDealerTip(game({ dealer: { enabled: false, mode: 'NONE' } }), 'alice', 1, 'CASH')).toThrow(/Aucun dealer/);
  });

  it('requires a Lightning destination for a Lightning tip', () => {
    expect(() => createDealerTip(game({ dealer: { enabled: true, mode: 'NONE' } }), 'alice', 1, 'LIGHTNING')).toThrow(/Destination Lightning/);
  });
});
