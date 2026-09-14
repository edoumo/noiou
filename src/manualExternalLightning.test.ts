import { describe, expect, it } from 'vitest';
import {
  buildManualExternalReference,
  isManualExternalReference,
  parseBolt11AmountFromHrp,
  parseExactBolt11Invoice,
} from './manualExternalLightning';

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function polymod(values: readonly number[]): number {
  const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let checksum = 1;
  for (const value of values) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let index = 0; index < generators.length; index += 1) if ((top >>> index) & 1) checksum ^= generators[index];
  }
  return checksum >>> 0;
}

function hrpExpand(hrp: string): number[] {
  return [...Array.from(hrp, (c) => c.charCodeAt(0) >>> 5), 0, ...Array.from(hrp, (c) => c.charCodeAt(0) & 31)];
}

function bech32(hrp: string, payload = [1, 2, 3, 4, 5, 6, 7]): string {
  const values = [...payload, 0, 0, 0, 0, 0, 0];
  const mod = polymod([...hrpExpand(hrp), ...values]) ^ 1;
  const checksum = Array.from({ length: 6 }, (_, index) => (mod >>> (5 * (5 - index))) & 31);
  return `${hrp}1${[...payload, ...checksum].map((value) => CHARSET[value]).join('')}`;
}

describe('manual external Lightning helpers', () => {
  it('parses BOLT11 HRP units exactly in millisats', () => {
    expect(parseBolt11AmountFromHrp('lnbc10u')?.msats).toBe(1_000_000n);
    expect(parseBolt11AmountFromHrp('lnbc10u')?.sats).toBe(1000);
    expect(parseBolt11AmountFromHrp('lnbc10000n')?.sats).toBe(1000);
    expect(parseBolt11AmountFromHrp('lnbc10000000p')?.sats).toBe(1000);
  });

  it('accepts a checksummed BOLT11 only when the amount matches', () => {
    const invoice = bech32('lnbc10u');
    expect(parseExactBolt11Invoice(invoice, 1000)).toBe(invoice);
    expect(() => parseExactBolt11Invoice(invoice, 2000)).toThrow(/Montant BOLT11 incorrect/);
  });

  it('rejects an invoice with an invalid checksum', () => {
    expect(() => parseExactBolt11Invoice('lnbc10u1qqqqqqq', 1000)).toThrow(/checksum/);
  });

  it('creates namespaced manual receipt references', () => {
    const reference = buildManualExternalReference('abc');
    expect(reference).toBe('manual-lightning:abc');
    expect(isManualExternalReference(reference)).toBe(true);
    expect(isManualExternalReference('invoice-1')).toBe(false);
  });
});
