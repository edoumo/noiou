import type { Contribution, ContributionKind, Game, PaymentMethod, Payout, SettlementResult } from './domain';
import { t } from './i18n';

function ensurePositiveAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error(t('error.contributionAmountPositive'));
}

export function createContribution(
  game: Game,
  playerId: string,
  kind: ContributionKind,
  method: PaymentMethod,
  id: string = crypto.randomUUID(),
  createdAt: string = new Date().toISOString(),
): Contribution {
  if (game.status !== 'OPEN') throw new Error(t('error.contributionsOpenOnly'));
  if (kind === 'REBUY' && !game.rebuyEnabled) throw new Error(t('error.rebuysDisabled'));

  const amount = kind === 'BUYIN' ? game.buyInAmount : (game.rebuyAmount ?? game.buyInAmount);
  ensurePositiveAmount(amount);

  return {
    id,
    gameId: game.id,
    playerId,
    kind,
    method,
    amount,
    status: 'CREATED',
    createdAt,
  };
}

export function markContributionPending(
  contributions: readonly Contribution[],
  contributionId: string,
  externalReference: string,
): Contribution[] {
  if (!externalReference.trim()) throw new Error(t('error.externalReferenceRequired'));
  const duplicate = contributions.find((item) => item.id !== contributionId && item.externalReference === externalReference);
  if (duplicate) throw new Error(t('error.externalReferenceUsed'));

  return contributions.map((item) => {
    if (item.id !== contributionId) return item;
    if (item.status === 'CANCELLED') throw new Error(t('error.cancelledCannotPending'));
    if (item.status === 'PAID') {
      if (item.externalReference === externalReference) return item;
      throw new Error(t('error.paidCannotChangeReference'));
    }
    return { ...item, status: 'PENDING', externalReference };
  });
}

export function confirmCashContribution(
  contributions: readonly Contribution[],
  contributionId: string,
  paidAt: string = new Date().toISOString(),
): Contribution[] {
  return contributions.map((item) => {
    if (item.id !== contributionId) return item;
    if (item.method !== 'CASH') throw new Error(t('error.notCashContribution'));
    if (item.status === 'CANCELLED') throw new Error(t('error.cancelledCannotPay'));
    if (item.status === 'PAID') return item;
    return { ...item, status: 'PAID', paidAt };
  });
}

export function confirmLightningContribution(
  contributions: readonly Contribution[],
  contributionId: string,
  externalReference: string,
  paidAt: string = new Date().toISOString(),
): Contribution[] {
  const duplicate = contributions.find((item) => item.id !== contributionId && item.externalReference === externalReference);
  if (duplicate) throw new Error(t('error.externalReferenceUsed'));

  return contributions.map((item) => {
    if (item.id !== contributionId) return item;
    if (item.method !== 'LIGHTNING') throw new Error(t('error.notLightningContribution'));
    if (item.status === 'CANCELLED') throw new Error(t('error.cancelledCannotPay'));
    if (item.status === 'PAID') {
      if (item.externalReference === externalReference) return item;
      throw new Error(t('error.paidCannotChangeReference'));
    }
    if (item.externalReference && item.externalReference !== externalReference) throw new Error(t('error.invoiceReferenceMismatch'));
    return { ...item, status: 'PAID', externalReference, paidAt };
  });
}

export function confirmPayout(payouts: readonly Payout[], playerId: string): Payout[] {
  return payouts.map((payout) => payout.playerId === playerId ? { ...payout, status: 'CONFIRMED' as const } : payout);
}

export interface ClosureCheck {
  allowed: boolean;
  reasons: string[];
}

export function checkGameClosure(
  settlement: SettlementResult | null,
  payouts: readonly Payout[],
  dealerCompensationConfirmed: boolean,
): ClosureCheck {
  const reasons: string[] = [];
  if (!settlement) reasons.push(t('closure.notCalculated'));
  else if (!settlement.balanced) reasons.push(t('closure.notBalanced'));

  if (settlement?.balanced) {
    const expectedPayees = settlement.payouts.filter((payout) => payout.amount > 0).map((payout) => payout.playerId);
    const confirmed = new Set(payouts.filter((payout) => payout.status === 'CONFIRMED').map((payout) => payout.playerId));
    if (expectedPayees.some((playerId) => !confirmed.has(playerId))) reasons.push(t('closure.payoutsUnconfirmed'));
    if (settlement.dealerCompensation > 0 && !dealerCompensationConfirmed) reasons.push(t('closure.dealerUnconfirmed'));
  }

  return { allowed: reasons.length === 0, reasons };
}
