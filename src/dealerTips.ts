import type { Currency, DealerTip, Game, PaymentMethod } from './domain';

function roundTipAmount(amount: number, currency: Currency): number {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Le tip dealer doit être positif');
  if (currency === 'SATS') {
    if (!Number.isInteger(amount)) throw new Error('Un tip en sats doit être un nombre entier');
    return amount;
  }
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function createDealerTip(
  game: Game,
  playerId: string,
  amount: number,
  method: PaymentMethod,
  id = crypto.randomUUID(),
  createdAt = new Date().toISOString(),
): DealerTip {
  if (!game.dealer.enabled) throw new Error('Aucun dealer n’est configuré pour cette partie');
  if (game.status !== 'CLOSED') throw new Error('Les tips dealer sont enregistrés après la clôture de la partie');
  if (!playerId) throw new Error('Joueur manquant pour le tip dealer');

  const rounded = roundTipAmount(amount, game.currency);
  let sats: number | undefined;
  if (method === 'LIGHTNING') {
    if (!game.dealer.lightningAddress) throw new Error('Destination Lightning du dealer manquante');
    if (game.currency === 'SATS') {
      sats = rounded;
    } else {
      if (!game.lockedBtcFiatRate || game.lockedBtcFiatRate <= 0) throw new Error('Taux BTC/fiat verrouillé manquant');
      sats = Math.round((rounded / game.lockedBtcFiatRate) * 100_000_000);
      if (sats <= 0) throw new Error('Le tip Lightning converti vaut 0 sat');
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
