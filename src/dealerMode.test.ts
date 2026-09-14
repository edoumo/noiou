import { describe, expect, it } from 'vitest';
import type { Contribution, Game, Player } from './domain';
import { calculateSettlement, computeDealerCompensation } from './settlement';

const players: Player[] = [
  { id: 'alice', nickname: 'Alice', preferredPayment: 'CASH' },
  { id: 'bob', nickname: 'Bob', preferredPayment: 'CASH' },
];

const baseGame: Game = {
  id: 'g-none',
  currency: 'EUR',
  buyInAmount: 20,
  rebuyEnabled: true,
  rebuyAmount: 20,
  chipValue: 1,
  status: 'SETTLING',
  dealer: { enabled: true, mode: 'NONE', label: 'Dealer' },
  createdAt: '2026-09-14T00:00:00Z',
};

const contributions: Contribution[] = players.map((player, index) => ({
  id: `c${index}`,
  gameId: baseGame.id,
  playerId: player.id,
  kind: 'BUYIN',
  method: 'CASH',
  amount: 20,
  status: 'PAID',
  createdAt: '2026-09-14T00:00:00Z',
}));

describe('non-remunerated dealer', () => {
  it('takes zero from the pot even when a stale value is present', () => {
    expect(computeDealerCompensation(100, { enabled: true, mode: 'NONE', value: 99 })).toBe(0);
  });

  it('leaves the full pot distributable to players', () => {
    const result = calculateSettlement(baseGame, players, contributions, [
      { playerId: 'alice', chips: 30 },
      { playerId: 'bob', chips: 10 },
    ]);
    expect(result.balanced).toBe(true);
    expect(result.dealerCompensation).toBe(0);
    expect(result.distributableAmount).toBe(40);
    expect(result.payouts.reduce((sum, payout) => sum + payout.amount, 0)).toBe(40);
  });
});
