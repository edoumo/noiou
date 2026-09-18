import type { Currency, DealerTip, Game, PaymentMethod } from './domain';
import { t } from './i18n';

function roundTipAmount(amount: number, currency: Currency): number {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error(t('error.tipPositive'));
  if (currency === 'SATS') {
    if (!Number.isInteger(amount)) throw new Error(t('error.tipInteger'));
    return amount;
  }
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function createDealerTip(
  game: Game,
  playerId: string,
  amount: number,
  method: PaymentMethod,
  id: string = crypto.randomUUID(),
  createdAt: string = new Date().toISOString(),
): DealerTip {
  if (!game.dealer.enabled) throw new Error(t('error.noDealerConfigured'));
  if (game.status !== 'CLOSED') throw new Error(t('error.tipsAfterClose'));
  if (!playerId) throw new Error(t('error.missingPlayerTip'));

  const rounded = roundTipAmount(amount, game.currency);
  let sats: number | undefined;
  if (method === 'LIGHTNING') {
    if (!game.dealer.lightningAddress) throw new Error(t('error.dealerDestinationMissing'));
    if (game.currency === 'SATS') {
      sats = rounded;
    } else {
      if (!game.lockedBtcFiatRate || game.lockedBtcFiatRate <= 0) throw new Error(t('error.rateMissing'));
      sats = Math.round((rounded / game.lockedBtcFiatRate) * 100_000_000);
      if (sats <= 0) throw new Error(t('error.dealerLightningConvertedZero'));
    }
  }

  return {
    id,
    gameId: game.id,
    playerId,
    amount: rounded,
    currency: game.currency,
    method,
    sats,
    createdAt,
  };
}
