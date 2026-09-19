import type { PaymentMethod } from './domain';
import { t } from './i18n';

export type PlayerPaymentChoice = PaymentMethod | 'ANY';

export function initialBuyInMethods(choice: PlayerPaymentChoice): PaymentMethod[] {
  if (choice === 'CASH') return ['CASH'];
  if (choice === 'LIGHTNING') return ['LIGHTNING'];
  return ['CASH', 'LIGHTNING'];
}

export function paymentChoiceLabel(choice: PlayerPaymentChoice): string {
  if (choice === 'CASH') return t('common.cash');
  if (choice === 'LIGHTNING') return t('common.lightning');
  return t('player.payment.any');
}

export function rebuyActionClass(choice: PlayerPaymentChoice, method: PaymentMethod): string {
  if (choice === 'ANY') return 'rebuy-equal';
  return choice === method ? 'rebuy-primary' : 'rebuy-secondary';
}
