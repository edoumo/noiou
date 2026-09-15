import { describe, expect, it } from 'vitest';
import { initialBuyInMethods, paymentChoiceLabel, rebuyActionClass } from './paymentFlow';

describe('payment flow choices', () => {
  it('restricts the initial cave to the selected payment method', () => {
    expect(initialBuyInMethods('CASH')).toEqual(['CASH']);
    expect(initialBuyInMethods('LIGHTNING')).toEqual(['LIGHTNING']);
    expect(initialBuyInMethods('ANY')).toEqual(['CASH', 'LIGHTNING']);
  });

  it('uses clear French labels', () => {
    expect(paymentChoiceLabel('CASH')).toBe('Espèces');
    expect(paymentChoiceLabel('LIGHTNING')).toBe('Lightning');
    expect(paymentChoiceLabel('ANY')).toBe('Espèces ou Lightning');
  });

  it('keeps both rebuy methods while emphasizing the initial cave method', () => {
    expect(rebuyActionClass('CASH', 'CASH')).toBe('rebuy-primary');
    expect(rebuyActionClass('CASH', 'LIGHTNING')).toBe('rebuy-secondary');
    expect(rebuyActionClass('LIGHTNING', 'LIGHTNING')).toBe('rebuy-primary');
    expect(rebuyActionClass('LIGHTNING', 'CASH')).toBe('rebuy-secondary');
    expect(rebuyActionClass('ANY', 'CASH')).toBe('rebuy-equal');
    expect(rebuyActionClass('ANY', 'LIGHTNING')).toBe('rebuy-equal');
  });
});
