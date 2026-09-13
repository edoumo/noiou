import type { Contribution, ContributionKind, Game, PaymentMethod, Payout, SettlementResult } from './domain';

function ensurePositiveAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be positive');
}

export function createContribution(
  game: Game,
  playerId: string,
  kind: ContributionKind,
  method: PaymentMethod,
  id = crypto.randomUUID(),
  createdAt = new Date().toISOString(),
): Contribution {
  if (game.status !== 'OPEN') throw new Error('Contributions are only allowed while the game is open');
  if (kind === 'REBUY' && !game.rebuyEnabled) throw new Error('Rebuys are disabled');

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
  if (!externalReference.trim()) throw new Error('External reference is required');
  const duplicate = contributions.find((item) => item.id !== contributionId && item.externalReference === externalReference);
  if (duplicate) throw new Error('External reference already used');

  return contributions.map((item) => {
    if (item.id !== contributionId) return item;
    if (item.status === 'CANCELLED') throw new Error('Cancelled contribution cannot become pending');
    if (item.status === 'PAID') {
      if (item.externalReference === externalReference) return item;
      throw new Error('Paid contribution cannot change external reference');
    }
    return { ...item, status: 'PENDING', externalReference };
  });
}

export function confirmCashContribution(
  contributions: readonly Contribution[],
  contributionId: string,
  paidAt = new Date().toISOString(),
): Contribution[] {
  return contributions.map((item) => {
    if (item.id !== contributionId) return item;
    if (item.method !== 'CASH') throw new Error('Contribution is not cash');
    if (item.status === 'CANCELLED') throw new Error('Cancelled contribution cannot be paid');
    if (item.status === 'PAID') return item;
    return { ...item, status: 'PAID', paidAt };
  });
}

export function confirmLightningContribution(
  contributions: readonly Contribution[],
  contributionId: string,
  externalReference: string,
  paidAt = new Date().toISOString(),
): Contribution[] {
  const duplicate = contributions.find((item) => item.id !== contributionId && item.externalReference === externalReference);
  if (duplicate) throw new Error('External reference already used');

  return contributions.map((item) => {
    if (item.id !== contributionId) return item;
    if (item.method !== 'LIGHTNING') throw new Error('Contribution is not Lightning');
    if (item.status === 'CANCELLED') throw new Error('Cancelled contribution cannot be paid');
    if (item.status === 'PAID') {
      if (item.externalReference === externalReference) return item;
      throw new Error('Paid contribution cannot change external reference');
    }
    if (item.externalReference && item.externalReference !== externalReference) throw new Error('Invoice reference mismatch');
    return { ...item, status: 'PAID', externalReference, paidAt };
  });
}

export function confirmPayout(payouts: readonly Payout[], playerId: string): Payout[] {
  return payouts.map((payout) => payout.playerId === playerId ? { ...payout, status: 'CONFIRMED' } : payout);
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
  if (!settlement) reasons.push('Settlement has not been calculated');
  else if (!settlement.balanced) reasons.push('Chip count is not balanced');

  if (settlement?.balanced) {
    const expectedPayees = settlement.payouts.filter((payout) => payout.amount > 0).map((payout) => payout.playerId);
    const confirmed = new Set(payouts.filter((payout) => payout.status === 'CONFIRMED').map((payout) => payout.playerId));
    if (expectedPayees.some((playerId) => !confirmed.has(playerId))) reasons.push('One or more player payouts remain unconfirmed');
    if (settlement.dealerCompensation > 0 && !dealerCompensationConfirmed) reasons.push('Dealer compensation remains unconfirmed');
  }

  return { allowed: reasons.length === 0, reasons };
}
