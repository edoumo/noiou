import type { Currency } from './domain';

export interface ManualLightningPayoutInput {
  label: string;
  destination: string;
  amount: number;
  currency: Currency;
  lockedBtcFiatRate?: number;
}

export interface ManualLightningPayoutInstruction extends ManualLightningPayoutInput {
  sats: number;
  summary: string;
}

export function payoutAmountToSats(amount: number, currency: Currency, lockedBtcFiatRate?: number): number {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Le montant du payout doit être positif');
  if (currency === 'SATS') {
    if (!Number.isInteger(amount)) throw new Error('Un payout en SATS doit être un nombre entier');
    return amount;
  }
  if (!lockedBtcFiatRate || !Number.isFinite(lockedBtcFiatRate) || lockedBtcFiatRate <= 0) {
    throw new Error('Le taux BTC/fiat verrouillé est requis pour préparer le payout Lightning');
  }
  const sats = Math.round((amount / lockedBtcFiatRate) * 100_000_000);
  if (sats <= 0) throw new Error('Le payout converti vaut 0 sat');
  return sats;
}

export function buildManualLightningPayout(input: ManualLightningPayoutInput): ManualLightningPayoutInstruction {
  const label = input.label.trim();
  const destination = input.destination.trim();
  if (!label) throw new Error('Le bénéficiaire est requis');
  if (!destination) throw new Error('La destination Lightning est requise');

  const sats = payoutAmountToSats(input.amount, input.currency, input.lockedBtcFiatRate);
  const original = input.currency === 'SATS'
    ? `${sats.toLocaleString('fr-FR')} sats`
    : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: input.currency }).format(input.amount);
  const summary = `NOIOU — payout manuel\nBénéficiaire: ${label}\nMontant partie: ${original}\nMontant Lightning: ${sats.toLocaleString('fr-FR')} sats\nDestination: ${destination}`;

  return { ...input, label, destination, sats, summary };
}
