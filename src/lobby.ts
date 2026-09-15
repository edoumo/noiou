import type { Contribution, Game, Player } from './domain';

export const MIN_POKER_PLAYERS = 2;

/**
 * Legacy OPEN sessions created before UX23 had no lobbyVersion and are treated as already started.
 * New UX23 games set lobbyVersion=1 and only become live once startedAt exists.
 */
export function isPlayStarted(game: Game | null | undefined): boolean {
  if (!game) return false;
  if (game.status !== 'OPEN') return game.status === 'SETTLING' || game.status === 'CLOSED';
  if (game.lobbyVersion !== 1) return true;
  return Boolean(game.startedAt);
}

export function hasPaidInitialCave(contributions: readonly Contribution[], playerId: string): boolean {
  return contributions.some((contribution) => contribution.playerId === playerId && contribution.kind === 'BUYIN' && contribution.status === 'PAID');
}

export function lobbyReadiness(players: readonly Player[], contributions: readonly Contribution[]): {
  canStart: boolean;
  minimumPlayersMet: boolean;
  allInitialCavesPaid: boolean;
  pendingFinancialAction: boolean;
  unpaidPlayerIds: string[];
} {
  const unpaidPlayerIds = players.filter((player) => !hasPaidInitialCave(contributions, player.id)).map((player) => player.id);
  const minimumPlayersMet = players.length >= MIN_POKER_PLAYERS;
  const allInitialCavesPaid = players.length > 0 && unpaidPlayerIds.length === 0;
  const pendingFinancialAction = contributions.some((contribution) => contribution.status === 'CREATED' || contribution.status === 'PENDING');
  return {
    canStart: minimumPlayersMet && allInitialCavesPaid && !pendingFinancialAction,
    minimumPlayersMet,
    allInitialCavesPaid,
    pendingFinancialAction,
    unpaidPlayerIds,
  };
}
