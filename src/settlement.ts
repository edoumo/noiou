import { t } from './i18n';
import type { Contribution, Currency, DealerRule, FinalStack, Game, Player, SettlementResult } from './domain';
import { isZeroDecimalCurrency, roundForCurrency } from './currency';

/**
 * Round an amount to the smallest usable unit of its currency.
 * Zero-decimal currencies (SATS, HUF, JPY, KRW) round to whole units; the
 * others round to cents. `step=0.01` is deliberately never assumed globally.
 */
export function roundAmount(value: number, currency: Currency): number {
  if (!Number.isFinite(value)) throw new Error(t('error.amountMustBeFinite'));
  return roundForCurrency(value, currency);
}

export function computeDealerCompensation(total: number, rule: DealerRule, currency: Currency = 'EUR'): number {
  if (!rule.enabled || rule.mode === 'NONE' || rule.mode === 'END_OF_GAME') return 0;
  const value = rule.value ?? 0;
  if (!Number.isFinite(value) || value < 0) throw new Error(t('error.dealerCompensationNonNegative'));
  if (rule.mode === 'PERCENT' && value > 100) throw new Error(t('error.dealerPercentMax'));
  if (rule.mode === 'FIXED') return roundAmount(value, currency);
  if (rule.mode === 'PERCENT') return roundAmount(total * (value / 100), currency);
  return 0;
}

function validateFinalStacks(finalStacks: FinalStack[]): void {
  const seen = new Set<string>();
  for (const stack of finalStacks) {
    if (seen.has(stack.playerId)) throw new Error(t('error.duplicateFinalStack', { player: stack.playerId }));
    seen.add(stack.playerId);
    if (!Number.isInteger(stack.chips) || stack.chips < 0) throw new Error(t('error.finalChipsNonNegative'));
  }
}

function paidContributionsForGame(game: Game, contributions: Contribution[]): Contribution[] {
  const paid = contributions.filter((contribution) => contribution.gameId === game.id && contribution.status === 'PAID');
  for (const contribution of paid) {
    if (!Number.isFinite(contribution.amount) || contribution.amount <= 0) throw new Error(t('error.paidContributionPositive'));
  }
  return paid;
}

/**
 * Returns the physical/table chip units that should exist for the paid contributions.
 * New games use chipsPerBuyIn and therefore never infer chip quantity from sats/euros/dollars.
 * The legacy chipValue calculation is retained only for old schema-v1 sessions/backups.
 */
export function calculateIssuedChips(game: Game, contributions: Contribution[]): number {
  const paid = paidContributionsForGame(game, contributions);
  if (game.chipsPerBuyIn !== undefined) {
    if (!Number.isInteger(game.chipsPerBuyIn) || game.chipsPerBuyIn <= 0) throw new Error(t('error.chipsPerBuyInPositive'));
    for (const contribution of paid) {
      const expectedAmount = contribution.kind === 'REBUY' ? (game.rebuyAmount ?? game.buyInAmount) : game.buyInAmount;
      if (roundAmount(contribution.amount, game.currency) !== roundAmount(expectedAmount, game.currency)) {
        throw new Error(t('error.contributionAmountMismatch'));
      }
    }
    return paid.length * game.chipsPerBuyIn;
  }

  if (!Number.isFinite(game.chipValue) || game.chipValue <= 0) throw new Error(t('error.chipValuePositive'));
  const totalPaid = roundAmount(paid.reduce((sum, contribution) => sum + contribution.amount, 0), game.currency);
  const rawIssuedChips = totalPaid / game.chipValue;
  if (!Number.isInteger(rawIssuedChips)) throw new Error(t('error.issuedChipsNotInteger'));
  return rawIssuedChips;
}

export function calculateSettlement(
  game: Game,
  players: Player[],
  contributions: Contribution[],
  finalStacks: FinalStack[],
): SettlementResult {
  validateFinalStacks(finalStacks);

  const paid = paidContributionsForGame(game, contributions);
  const totalPaid = roundAmount(paid.reduce((sum, contribution) => sum + contribution.amount, 0), game.currency);
  const issuedChips = calculateIssuedChips(game, contributions);
  const countedChips = finalStacks.reduce((sum, stack) => sum + stack.chips, 0);
  const chipDifference = countedChips - issuedChips;

  if (chipDifference !== 0) {
    return {
      balanced: false,
      issuedChips,
      countedChips,
      chipDifference,
      distributableAmount: totalPaid,
      dealerCompensation: 0,
      payouts: [],
    };
  }

  const dealerCompensation = computeDealerCompensation(totalPaid, game.dealer, game.currency);
  const distributableAmount = roundAmount(totalPaid - dealerCompensation, game.currency);
  if (distributableAmount < 0) throw new Error(t('error.dealerExceedsFunds'));

  if (game.chipsPerBuyIn === undefined) {
    const totalStackValue = roundAmount(countedChips * game.chipValue, game.currency);
    const tolerance = isZeroDecimalCurrency(game.currency) ? 0 : 0.01;
    if (Math.abs(totalStackValue - totalPaid) > tolerance) throw new Error(t('error.chipInvariant'));
  }

  const playerMap = new Map(players.map((player) => [player.id, player]));
  const rawPayouts = finalStacks.map((stack) => {
    const player = playerMap.get(stack.playerId);
    if (!player) throw new Error(t('error.unknownPlayerById', { player: stack.playerId }));
    const ratio = countedChips === 0 ? 0 : stack.chips / countedChips;
    return {
      playerId: stack.playerId,
      amount: roundAmount(distributableAmount * ratio, game.currency),
      // The payment selected when joining is only for the initial cave. At payout,
      // the beneficiary is free to choose cash or Lightning independently.
      method: 'ANY' as const,
      status: 'PENDING' as const,
    };
  });

  const expected = distributableAmount;
  const current = roundAmount(rawPayouts.reduce((sum, payout) => sum + payout.amount, 0), game.currency);
  const drift = roundAmount(expected - current, game.currency);
  if (rawPayouts.length > 0 && drift !== 0) {
    const last = rawPayouts[rawPayouts.length - 1];
    last.amount = roundAmount(last.amount + drift, game.currency);
  }

  const payoutTotal = roundAmount(rawPayouts.reduce((sum, payout) => sum + payout.amount, 0), game.currency);
  if (payoutTotal + dealerCompensation !== totalPaid) throw new Error(t('error.settlementInvariant'));

  return {
    balanced: true,
    issuedChips,
    countedChips,
    chipDifference,
    distributableAmount,
    dealerCompensation,
    payouts: rawPayouts,
  };
}
