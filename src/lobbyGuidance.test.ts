import { describe, expect, it } from 'vitest';
import type { Contribution, Player } from './domain';
import { buyInAttentionState, firstOutstandingBuyInPlayerId } from './lobbyGuidance';

const players: Player[] = [
  { id: 'a', nickname: 'Alice', preferredPayment: 'CASH' },
  { id: 'b', nickname: 'Bob', preferredPayment: 'LIGHTNING' },
];

function buyIn(playerId: string, status: Contribution['status']): Contribution {
  return {
    id: `c-${playerId}-${status}`,
    gameId: 'g',
    playerId,
    kind: 'BUYIN',
    method: playerId === 'a' ? 'CASH' : 'LIGHTNING',
    amount: 100,
    status,
    createdAt: '2026-09-17T06:00:00Z',
    paidAt: status === 'PAID' ? '2026-09-17T06:01:00Z' : undefined,
  };
}

describe('UX25 lobby guidance', () => {
  it('distinguishes cave required, payment pending and cave paid', () => {
    expect(buyInAttentionState('a', [])).toBe('REQUIRED');
    expect(buyInAttentionState('a', [buyIn('a', 'CREATED')])).toBe('PENDING');
    expect(buyInAttentionState('a', [buyIn('a', 'PENDING')])).toBe('PENDING');
    expect(buyInAttentionState('a', [buyIn('a', 'PAID')])).toBe('PAID');
  });

  it('points at the next player whose initial cave still needs attention', () => {
    expect(firstOutstandingBuyInPlayerId(players, [])).toBe('a');
    expect(firstOutstandingBuyInPlayerId(players, [buyIn('a', 'PAID')])).toBe('b');
    expect(firstOutstandingBuyInPlayerId(players, [buyIn('a', 'PAID'), buyIn('b', 'PAID')])).toBeNull();
  });
});
