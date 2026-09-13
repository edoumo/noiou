import type { Contribution, DealerRule, FinalStack, Game, Player, SettlementResult } from './domain';

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function computeDealerCompensation(total: number, rule: DealerRule): number {
  if (!rule.enabled || rule.mode === 'NONE') return 0;
  if (rule.mode === 'FIXED') return roundMoney(rule.value ?? 0);
  if (rule.mode === 'PERCENT') return roundMoney(total * ((rule.value ?? 0) / 100));
  return 0;
}

export function calculateSettlement(
  game: Game,
  players: Player[],
  contributions: Contribution[],
  finalStacks: FinalStack[],
): SettlementResult {
  const paid = contributions.filter((c) => c.gameId === game.id && c.status === 'PAID');
  const totalPaid = roundMoney(paid.reduce((sum, c) => sum + c.amount, 0));
  const issuedChips = Math.round(totalPaid / game.chipValue);
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

  const dealerCompensation = computeDealerCompensation(totalPaid, game.dealer);
  const distributableAmount = roundMoney(totalPaid - dealerCompensation);
  if (distributableAmount < 0) throw new Error('Dealer compensation exceeds available funds');

  const totalStackValue = roundMoney(countedChips * game.chipValue);
  if (Math.abs(totalStackValue - totalPaid) > 0.01) {
    throw new Error('Chip value invariant violated');
  }

  const playerMap = new Map(players.map((p) => [p.id, p]));
  const rawPayouts = finalStacks.map((stack) => {
    const player = playerMap.get(stack.playerId);
    if (!player) throw new Error(`Unknown player ${stack.playerId}`);
    const gross = stack.chips * game.chipValue;
    const ratio = totalPaid === 0 ? 0 : gross / totalPaid;
    return {
      playerId: stack.playerId,
      amount: roundMoney(distributableAmount * ratio),
      method: player.preferredPayment,
      status: 'PENDING' as const,
    };
  });

  const expected = distributableAmount;
  const current = roundMoney(rawPayouts.reduce((sum, p) => sum + p.amount, 0));
  const drift = roundMoney(expected - current);
  if (rawPayouts.length > 0 && drift !== 0) rawPayouts[rawPayouts.length - 1].amount = roundMoney(rawPayouts[rawPayouts.length - 1].amount + drift);

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
