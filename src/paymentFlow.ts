import type { PaymentMethod } from './domain';

export type PlayerPaymentChoice = PaymentMethod | 'ANY';

export function initialBuyInMethods(choice: PlayerPaymentChoice): PaymentMethod[] {
  if (choice === 'CASH') return ['CASH'];
  if (choice === 'LIGHTNING') return ['LIGHTNING'];
  return ['CASH', 'LIGHTNING'];
}

export function paymentChoiceLabel(choice: PlayerPaymentChoice): string {
  if (choice === 'CASH') return 'Espèces';
  if (choice === 'LIGHTNING') return 'Lightning';
  return 'Espèces ou Lightning';
}

export function rebuyActionClass(choice: PlayerPaymentChoice, method: PaymentMethod): string {
  if (choice === 'ANY') return 'rebuy-equal';
  return choice === method ? 'rebuy-primary' : 'rebuy-secondary';
}
