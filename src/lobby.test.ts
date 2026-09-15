import { describe, expect, it } from 'vitest';
import type { Contribution, Game, Player } from './domain';
import { isPlayStarted, lobbyReadiness } from './lobby';

const game: Game = {
  id: 'g', currency: 'SATS', buyInAmount: 100, rebuyEnabled: true, rebuyAmount: 100,
  chipsPerBuyIn: 10, chipValue: 10, status: 'OPEN', dealer: { enabled: false, mode: 'NONE' },
  createdAt: '2026-09-15T20:00:00Z', lobbyVersion: 1,
};

const players: Player[] = [
  { id: 'a', nickname: 'Alice', preferredPayment: 'CASH' },
  { id: 'b', nickname: 'Bob', preferredPayment: 'LIGHTNING' },
];

function paid(playerId: string): Contribution {
  return {
    id: `c-${playerId}`, gameId: 'g', playerId, kind: 'BUYIN', method: playerId === 'a' ? 'CASH' : 'LIGHTNING',
    amount: 100, status: 'PAID', createdAt: '2026-09-15T20:01:00Z', paidAt: '2026-09-15T20:02:00Z',
  };
}

describe('UX23 lobby', () => {
  it('requires at least two players and every initial cave before play starts', () => {
    expect(lobbyReadiness(players.slice(0, 1), [paid('a')]).canStart).toBe(false);
    expect(lobbyReadiness(players, [paid('a')]).canStart).toBe(false);
    expect(lobbyReadiness(players, [paid('a'), paid('b')]).canStart).toBe(true);
  });

  it('blocks start while a financial action is pending', () => {
    const pending: Contribution = { ...paid('b'), status: 'PENDING', paidAt: undefined };
    expect(lobbyReadiness(players, [paid('a'), pending]).pendingFinancialAction).toBe(true);
    expect(lobbyReadiness(players, [paid('a'), pending]).canStart).toBe(false);
  });

  it('treats new lobby games as not started until startedAt exists', () => {
    expect(isPlayStarted(game)).toBe(false);
    expect(isPlayStarted({ ...game, startedAt: '2026-09-15T20:05:00Z' })).toBe(true);
  });

  it('keeps legacy OPEN sessions usable as already started', () => {
    expect(isPlayStarted({ ...game, lobbyVersion: undefined })).toBe(true);
  });
});
