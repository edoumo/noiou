import type { Contribution, ContributionKind, Game, Payout, Player } from './domain';
import { confirmLightningContribution, confirmPayout, createContribution, markContributionPending } from './game';
import { t } from './i18n';

export interface OrganizerAllocationResult {
  contribution: Contribution;
  contributions: Contribution[];
  reference: string;
}

export function allocateOrganizerWalletContribution(
  game: Game,
  player: Player,
  kind: ContributionKind,
  current: readonly Contribution[],
  id: string = crypto.randomUUID(),
  at: string = new Date().toISOString(),
): OrganizerAllocationResult {
  if (!player.isOrganizer) throw new Error(t('error.notOrganizer'));
  if (game.currency !== 'SATS') throw new Error(t('error.organizerSatsOnly'));
  if (kind === 'BUYIN' && current.some((item) => item.playerId === player.id && item.kind === 'BUYIN' && item.status !== 'CANCELLED')) {
    throw new Error(t('error.organizerBuyInExists'));
  }
  if (kind === 'REBUY' && !current.some((item) => item.playerId === player.id && item.kind === 'BUYIN' && item.status === 'PAID')) {
    throw new Error(t('error.initialBuyInFirst'));
  }

  const contribution = createContribution(game, player.id, kind, 'LIGHTNING', id, at);
  const reference = `organizer-allocation:${id}`;
  const pending = markContributionPending([...current, contribution], contribution.id, reference);
  const contributions = confirmLightningContribution(pending, contribution.id, reference, at);
  return { contribution: contributions.find((item) => item.id === contribution.id)!, contributions, reference };
}

export function retainOrganizerPayout(
  payouts: readonly Payout[],
  player: Player,
): Payout[] {
  if (!player.isOrganizer) throw new Error(t('error.notOrganizer'));
  const target = payouts.find((payout) => payout.playerId === player.id);
  if (!target || target.status !== 'PENDING') throw new Error(t('error.organizerPayoutNotFound'));
  const prepared = payouts.map((payout) => payout.playerId === player.id
    ? { ...payout, method: 'LIGHTNING' as const, lightningRequest: undefined, execution: 'ORGANIZER_WALLET_RETENTION' as const }
    : payout);
  return confirmPayout(prepared, player.id);
}
