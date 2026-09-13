import { describe, expect, it } from 'vitest';
import type { Contribution, Game, Player } from './domain';
import { calculateSettlement, computeDealerCompensation } from './settlement';

const players: Player[] = [
  { id: 'a', nickname: 'Alice', preferredPayment: 'CASH' },
  { id: 'b', nickname: 'Bob', preferredPayment: 'LIGHTNING' },
];

function game(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1', currency: 'EUR', buyInAmount: 20, rebuyEnabled: true, rebuyAmount: 20,
    chipValue: 1, status: 'SETTLING', dealer: { enabled: false, mode: 'NONE' },
    createdAt: '2026-09-13T00:00:00Z', ...overrides,
  };
}

function paid(id: string, playerId: string, amount = 20, kind: 'BUYIN' | 'REBUY' = 'BUYIN'): Contribution {
  return { id, gameId: 'g1', playerId, kind, method: playerId === 'a' ? 'CASH' : 'LIGHTNING', amount, status: 'PAID', createdAt: '2026-09-13T00:00:00Z', paidAt: '2026-09-13T00:01:00Z' };
}

describe('settlement', () => {
  it('settles a balanced mixed cash/lightning game', () => {
    const result = calculateSettlement(game(), players, [paid('1','a'), paid('2','b')], [{ playerId:'a', chips:30 }, { playerId:'b', chips:10 }]);
    expect(result.balanced).toBe(true);
    expect(result.distributableAmount).toBe(40);
    expect(result.payouts.map(p => p.amount)).toEqual([30,10]);
  });

  it('blocks settlement when final chips do not equal issued chips', () => {
    const result = calculateSettlement(game(), players, [paid('1','a'), paid('2','b')], [{ playerId:'a', chips:31 }, { playerId:'b', chips:10 }]);
    expect(result.balanced).toBe(false);
    expect(result.payouts).toHaveLength(0);
    expect(result.chipDifference).toBe(1);
  });

  it('includes paid rebuys in issued value', () => {
    const result = calculateSettlement(game(), players, [paid('1','a'), paid('2','b'), paid('3','b',20,'REBUY')], [{ playerId:'a', chips:20 }, { playerId:'b', chips:40 }]);
    expect(result.balanced).toBe(true);
    expect(result.issuedChips).toBe(60);
  });

  it('ignores unpaid contributions', () => {
    const pending: Contribution = { ...paid('2','b'), status:'PENDING', paidAt:undefined };
    const result = calculateSettlement(game(), players, [paid('1','a'), pending], [{ playerId:'a', chips:20 }, { playerId:'b', chips:0 }]);
    expect(result.issuedChips).toBe(20);
    expect(result.balanced).toBe(true);
  });

  it('computes dealer fixed and percent compensation explicitly', () => {
    expect(computeDealerCompensation(100, { enabled:true, mode:'FIXED', value:5 })).toBe(5);
    expect(computeDealerCompensation(100, { enabled:true, mode:'PERCENT', value:10 })).toBe(10);
  });

  it('keeps dealer compensation outside player distributable amount', () => {
    const result = calculateSettlement(game({ dealer:{ enabled:true, mode:'PERCENT', value:10 } }), players, [paid('1','a'), paid('2','b')], [{ playerId:'a', chips:30 }, { playerId:'b', chips:10 }]);
    expect(result.dealerCompensation).toBe(4);
    expect(result.distributableAmount).toBe(36);
    expect(result.payouts.reduce((sum,payout)=>sum+payout.amount,0)).toBe(36);
  });

  it('rounds SATS as integer amounts and preserves conservation', () => {
    const satsGame = game({ currency:'SATS', buyInAmount:1001, rebuyAmount:1001, chipValue:1 });
    const result = calculateSettlement(satsGame, players, [paid('1','a',1001), paid('2','b',1001)], [{ playerId:'a', chips:1000 }, { playerId:'b', chips:1002 }]);
    expect(result.payouts.every((payout) => Number.isInteger(payout.amount))).toBe(true);
    expect(result.payouts.reduce((sum,payout)=>sum+payout.amount,0) + result.dealerCompensation).toBe(2002);
  });

  it('rejects negative or fractional physical chip counts', () => {
    expect(() => calculateSettlement(game(), players, [paid('1','a')], [{ playerId:'a', chips:-1 }])).toThrow(/non-negative integers/);
    expect(() => calculateSettlement(game(), players, [paid('1','a')], [{ playerId:'a', chips:19.5 }])).toThrow(/non-negative integers/);
  });

  it('rejects duplicate final stacks for the same player', () => {
    expect(() => calculateSettlement(game(), players, [paid('1','a')], [{ playerId:'a', chips:10 }, { playerId:'a', chips:10 }])).toThrow(/Duplicate/);
  });
});
