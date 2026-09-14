import { describe, expect, it } from 'vitest';
import { normalizeReusableLightningDestination, parseLightningDestination } from './lightningDestination';

describe('Lightning destinations', () => {
  it('accepts a Lightning Address as reusable', () => {
    expect(parseLightningDestination('alice@example.com')).toMatchObject({ kind: 'LIGHTNING_ADDRESS', reusable: true });
    expect(normalizeReusableLightningDestination('alice@example.com')).toBe('alice@example.com');
  });

  it('accepts a BOLT12 offer as a reusable destination', () => {
    const offer = 'lno1qcp4256ypq';
    expect(parseLightningDestination(offer)).toMatchObject({ kind: 'BOLT12_OFFER', reusable: true, value: offer });
  });

  it('never confuses BOLT11 prefixes with BOLT12 offers', () => {
    expect(parseLightningDestination('lnbc10u1pexample')).toMatchObject({ kind: 'BOLT11_INVOICE', reusable: false });
    expect(parseLightningDestination('lntb10u1pexample')).toMatchObject({ kind: 'BOLT11_INVOICE', reusable: false });
    expect(parseLightningDestination('lnbcrt10u1pexample')).toMatchObject({ kind: 'BOLT11_INVOICE', reusable: false });
    expect(parseLightningDestination('lno1qcp4256ypq')).toMatchObject({ kind: 'BOLT12_OFFER', reusable: true });
  });

  it('unwraps lightning: QR payloads', () => {
    expect(parseLightningDestination('lightning:lno1qcp4256ypq')).toMatchObject({ kind: 'BOLT12_OFFER', value: 'lno1qcp4256ypq' });
  });

  it('extracts a Lightning payload from a BIP21 URI', () => {
    const destination = parseLightningDestination('bitcoin:bc1qexample?amount=0.001&lightning=lno1qcp4256ypq');
    expect(destination).toMatchObject({ kind: 'BOLT12_OFFER', value: 'lno1qcp4256ypq' });
  });

  it('accepts encoded LNURL destinations', () => {
    expect(parseLightningDestination('LNURL1DP68GURN8GHJ7')).toMatchObject({ kind: 'LNURL', reusable: true });
  });

  it('classifies BOLT11 invoices as one-time and rejects them for saved player/dealer profiles', () => {
    const invoice = 'lnbc10u1pexample';
    expect(parseLightningDestination(invoice)).toMatchObject({ kind: 'BOLT11_INVOICE', reusable: false });
    expect(() => normalizeReusableLightningDestination(invoice)).toThrow(/ponctuelle/);
  });

  it('rejects unknown values', () => {
    expect(parseLightningDestination('not-lightning')).toMatchObject({ kind: 'UNKNOWN', reusable: false });
    expect(() => normalizeReusableLightningDestination('not-lightning')).toThrow(/non reconnue/);
  });
});
