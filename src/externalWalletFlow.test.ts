import { describe, expect, it } from 'vitest';
import { buildPaymentTrace, prepareExternalIncomingRequest, shortGameReference } from './externalWalletFlow';

describe('external wallet impartial flow', () => {
  it('builds a short stable game reference and readable payment trace', () => {
    expect(shortGameReference('12345678-90ab-cdef-1234-567890abcdef')).toBe('12345678');
    expect(buildPaymentTrace('12345678-90ab-cdef-1234-567890abcdef', ' Alice   Martin ', 'BUYIN')).toBe('NOIOU 12345678 · Alice Martin · Cave');
    expect(buildPaymentTrace('12345678-90ab-cdef-1234-567890abcdef', 'Bob', 'REBUY', 2)).toBe('NOIOU 12345678 · Bob · Recave 2');
  });

  it('requires an exact BOLT11 when no organizer destination is associated', async () => {
    const request = await prepareExternalIncomingRequest(undefined, 100, 'NOIOU TEST · Alice · Cave');
    expect(request.request).toBe('');
    expect(request.source).toBe('MANUAL_EXTERNAL');
    expect(request.preparationError).toMatch(/BOLT11 de 100 sats/);
  });

  it('does not present a reusable BOLT12 offer as an exact amount QR', async () => {
    const request = await prepareExternalIncomingRequest('lno1qcp4256ypq', 100, 'NOIOU TEST · Alice · Cave');
    expect(request.request).toBe('');
    expect(request.preparationError).toMatch(/BOLT12/);
    expect(request.preparationError).toMatch(/100 sats/);
  });
});
