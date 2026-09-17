import type { Contribution, Player } from './domain';

export type BuyInAttentionState = 'REQUIRED' | 'PENDING' | 'PAID';

export function buyInAttentionState(playerId: string, contributions: readonly Contribution[]): BuyInAttentionState {
  const buyIns = contributions.filter((item) => item.playerId === playerId && item.kind === 'BUYIN');
  if (buyIns.some((item) => item.status === 'PAID')) return 'PAID';
  if (buyIns.some((item) => item.status === 'CREATED' || item.status === 'PENDING')) return 'PENDING';
  return 'REQUIRED';
}

export function firstOutstandingBuyInPlayerId(players: readonly Player[], contributions: readonly Contribution[]): string | null {
  return players.find((player) => buyInAttentionState(player.id, contributions) !== 'PAID')?.id ?? null;
}
