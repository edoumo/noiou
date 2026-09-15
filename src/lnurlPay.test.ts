import { describe, expect, it } from 'vitest';
import { decodeLnurlToUrl, lightningAddressToUrl, requestExactInvoiceFromReusableDestination } from './lnurlPay';

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

function checksum(hrp: string, payload: number[]): number[] {
  const values = [...payload, 0, 0, 0, 0, 0, 0];
  const mod = polymod([...hrpExpand(hrp), ...values]) ^ 1;
  return Array.from({ length: 6 }, (_, index) => (mod >>> (5 * (5 - index))) & 31);
}

function bech32(hrp: string, payload: number[]): string {
  return `${hrp}1${[...payload, ...checksum(hrp, payload)].map((value) => CHARSET[value]).join('')}`;
}

function bytesToWords(bytes: Uint8Array): number[] {
  let accumulator = 0;
  let bits = 0;
  const result: number[] = [];
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result.push((accumulator >> bits) & 31);
    }
  }
  if (bits > 0) result.push((accumulator << (5 - bits)) & 31);
  return result;
}

function lnurl(url: string): string {
  return bech32('lnurl', bytesToWords(new TextEncoder().encode(url)));
}

function bolt11ForSats(sats: number): string {
  const hrp = `lnbc${sats * 10}n`;
  return bech32(hrp, [1, 2, 3, 4, 5, 6, 7]);
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

describe('LNURL-pay exact invoice preparation', () => {
  it('maps a Lightning Address to its well-known LNURL-pay endpoint', () => {
    expect(lightningAddressToUrl('alice@example.com')).toBe('https://example.com/.well-known/lnurlp/alice');
  });

  it('decodes a checksummed LNURL to HTTPS', () => {
    expect(decodeLnurlToUrl(lnurl('https://example.com/lnurlp/alice'))).toBe('https://example.com/lnurlp/alice');
  });

  it('requests the exact amount and sends a bounded trace comment when supported', async () => {
    const invoice = bolt11ForSats(100);
    const seen: string[] = [];
    const fetcher = async (input: string | URL) => {
      const url = String(input);
      seen.push(url);
      if (url.includes('/.well-known/lnurlp/')) return jsonResponse({
        callback: 'https://pay.example.com/cb?token=abc',
        minSendable: 1000,
        maxSendable: 1_000_000,
        metadata: '[["text/plain","Alice wallet"]]',
        tag: 'payRequest',
        commentAllowed: 18,
      });
      expect(url).toContain('amount=100000');
      expect(url).toContain('comment=NOIOU+G123+Alice+C');
      return jsonResponse({ pr: invoice, routes: [] });
    };

    const result = await requestExactInvoiceFromReusableDestination('alice@example.com', 100, 'NOIOU G123 Alice Cave 1', fetcher);
    expect(result.invoice).toBe(invoice);
    expect(result.commentSent).toBe('NOIOU G123 Alice C');
    expect(result.serviceDescription).toBe('Alice wallet');
    expect(seen).toHaveLength(2);
  });

  it('refuses a wallet range that excludes the requested amount', async () => {
    const fetcher = async () => jsonResponse({
      callback: 'https://pay.example.com/cb',
      minSendable: 200_000,
      maxSendable: 400_000,
      metadata: '[["text/plain","wallet"]]',
      tag: 'payRequest',
    });
    await expect(requestExactInvoiceFromReusableDestination('alice@example.com', 100, 'trace', fetcher)).rejects.toThrow(/plage autorisée 200–400 sats/);
  });

  it('refuses an invoice returned with a different amount and explains why', async () => {
    let call = 0;
    const fetcher = async () => {
      call += 1;
      if (call === 1) return jsonResponse({
        callback: 'https://pay.example.com/cb',
        minSendable: 1000,
        maxSendable: 1_000_000,
        metadata: '[["text/plain","wallet"]]',
        tag: 'payRequest',
      });
      return jsonResponse({ pr: bolt11ForSats(1000) });
    };
    await expect(requestExactInvoiceFromReusableDestination('alice@example.com', 100, 'trace', fetcher)).rejects.toThrow(/Invoice refusée par NOIOU.*invoice 1 000 sats, attendu 100 sats/);
  });

  it('blocks non-HTTPS LNURL endpoints before fetching them', async () => {
    await expect(requestExactInvoiceFromReusableDestination(lnurl('http://example.com/pay'), 100, 'trace', async () => jsonResponse({}))).rejects.toThrow(/HTTPS/);
  });
});
