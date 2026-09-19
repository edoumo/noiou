import type { Currency } from './domain';
import { t } from './i18n';

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
  if (!Number.isFinite(amount) || amount <= 0) throw new Error(t('error.payoutPositive'));
  if (currency === 'SATS') {
    if (!Number.isInteger(amount)) throw new Error(t('error.payoutInteger'));
    return amount;
  }
  if (!lockedBtcFiatRate || !Number.isFinite(lockedBtcFiatRate) || lockedBtcFiatRate <= 0) {
    throw new Error(t('error.payoutRateRequired'));
  }
  const sats = Math.round((amount / lockedBtcFiatRate) * 100_000_000);
  if (sats <= 0) throw new Error(t('error.payoutZero'));
  return sats;
}

export function buildManualLightningPayout(input: ManualLightningPayoutInput): ManualLightningPayoutInstruction {
  const label = input.label.trim();
  const destination = input.destination.trim();
  if (!label) throw new Error(t('error.beneficiaryRequired'));
  if (!destination) throw new Error(t('error.destinationRequired'));

  const sats = payoutAmountToSats(input.amount, input.currency, input.lockedBtcFiatRate);
  const original = input.currency === 'SATS'
    ? `${sats.toLocaleString('fr-FR')} sats`
    : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: input.currency }).format(input.amount);
  const summary = t('manualPayout.summary', {
    label,
    original,
    sats: sats.toLocaleString('fr-FR'),
    destination,
  });

  return { ...input, label, destination, sats, summary };
}
