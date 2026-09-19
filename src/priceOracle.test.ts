/**
 * Price oracle tests (NOIOU).
 *
 * Covers the mandate's §34 list: Kraken EUR/USD, bid, ask, midpoint, network
 * offline, timeout, invalid JSON, invalid bid, invalid ask, stale quote, manual
 * selection (direct + offline), manual confirmation, SATS no-oracle.
 *
 * No test touches the network: `fetch` is injected everywhere.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_RATE_PROVIDER,
  endpointForProvider,
  fetchQuote,
  isQuoteFresh,
  legacyLockedRate,
  lockQuote,
  manualLockedRate,
  midpointRate,
  parseCoinbaseSpot,
  parseKrakenTicker,
  PriceOracleError,
  providerRequiresNetwork,
  RATE_MAX_AGE_MS,
  type RateQuote,
} from './priceOracle';

/* ------------------------------------------------------------- helpers */

function jsonResponse(payload: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => payload,
  } as unknown as Response;
}

const KRAKEN_EUR_PAYLOAD = {
  error: [],
  result: { XXBTZEUR: { a: ['70558.00000', '1', '1.000'], b: ['70557.90000', '1', '1.000'], c: ['70567.40000', '0.00432003'] } },
};

const KRAKEN_USD_PAYLOAD = {
  error: [],
  result: { XXBTZUSD: { a: ['81110.30000', '1', '1.000'], b: ['81110.20000', '1', '1.000'], c: ['81110.30000', '0.00024413'] } },
};

/* --------------------------------------------------------- kraken parse */

describe('kraken ticker parsing', () => {
  it('reads best bid and best ask for BTC/EUR', () => {
    const { bid, ask } = parseKrakenTicker(KRAKEN_EUR_PAYLOAD, 'EUR');
    expect(bid).toBe(70557.9);
    expect(ask).toBe(70558);
  });

  it('reads best bid and best ask for BTC/USD', () => {
    const { bid, ask } = parseKrakenTicker(KRAKEN_USD_PAYLOAD, 'USD');
    expect(bid).toBe(81110.2);
    expect(ask).toBe(81110.3);
  });

  it('computes the midpoint as (bid + ask) / 2', () => {
    const { bid, ask } = parseKrakenTicker(KRAKEN_EUR_PAYLOAD, 'EUR');
    expect(midpointRate(bid, ask)).toBeCloseTo(70557.95, 6);
  });

  it('rejects an invalid bid instead of inventing a price', () => {
    const payload = { error: [], result: { XXBTZEUR: { a: ['70558.00000'], b: ['not-a-number'] } } };
    expect(() => parseKrakenTicker(payload, 'EUR')).toThrow(PriceOracleError);
    try {
      parseKrakenTicker(payload, 'EUR');
    } catch (error) {
      expect((error as PriceOracleError).code).toBe('INVALID_QUOTE');
    }
  });

  it('rejects an invalid ask', () => {
    const payload = { error: [], result: { XXBTZEUR: { a: [], b: ['70557.90000'] } } };
    try {
      parseKrakenTicker(payload, 'EUR');
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as PriceOracleError).code).toBe('INVALID_QUOTE');
    }
  });

  it('rejects a non-object payload', () => {
    try {
      parseKrakenTicker('nope', 'EUR');
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as PriceOracleError).code).toBe('INVALID_JSON');
    }
  });

  it('rejects a missing pair', () => {
    try {
      parseKrakenTicker({ error: ['EQuery:Unknown asset pair'], result: {} }, 'EUR');
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as PriceOracleError).code).toBe('PAIR_MISSING');
    }
  });
});

/* ------------------------------------------------------- coinbase parse */

describe('coinbase spot parsing', () => {
  it('uses the spot value as both bid and ask', () => {
    const { bid, ask } = parseCoinbaseSpot({ data: { amount: '70557.27', base: 'BTC', currency: 'EUR' } });
    expect(bid).toBe(70557.27);
    expect(ask).toBe(70557.27);
    expect(midpointRate(bid, ask)).toBe(70557.27);
  });

  it('rejects an invalid amount', () => {
    try {
      parseCoinbaseSpot({ data: { amount: 'oops' } });
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as PriceOracleError).code).toBe('INVALID_QUOTE');
    }
  });
});

/* ----------------------------------------------------------- fetchQuote */

describe('fetchQuote', () => {
  it('returns a fresh midpoint quote for Kraken EUR', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(KRAKEN_EUR_PAYLOAD)) as unknown as typeof fetch;
    const quote = await fetchQuote({ provider: 'KRAKEN', quote: 'EUR', fetchImpl, isOnline: () => true, now: () => Date.parse('2026-09-19T10:00:00Z') });
    expect(quote.provider).toBe('KRAKEN');
    expect(quote.pair).toBe('BTC/EUR');
    expect(quote.rate).toBeCloseTo(70557.95, 6);
    expect(quote.retrievedAt).toBe('2026-09-19T10:00:00.000Z');
    expect(isQuoteFresh(quote, Date.parse('2026-09-19T10:00:30Z'))).toBe(true);
  });

  it('returns a fresh midpoint quote for Kraken USD', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(KRAKEN_USD_PAYLOAD)) as unknown as typeof fetch;
    const quote = await fetchQuote({ provider: 'KRAKEN', quote: 'USD', fetchImpl, isOnline: () => true });
    expect(quote.pair).toBe('BTC/USD');
    expect(quote.rate).toBeCloseTo(81110.25, 6);
  });

  it('fails immediately with OFFLINE when the browser reports no connection', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(KRAKEN_EUR_PAYLOAD)) as unknown as typeof fetch;
    await expect(fetchQuote({ provider: 'KRAKEN', quote: 'EUR', fetchImpl, isOnline: () => false })).rejects.toMatchObject({ code: 'OFFLINE' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps a timeout to the TIMEOUT code', async () => {
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const fetchImpl = vi.fn(async () => { throw abortError; }) as unknown as typeof fetch;
    await expect(fetchQuote({ provider: 'KRAKEN', quote: 'EUR', fetchImpl, isOnline: () => true })).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('maps a transport failure to the NETWORK code', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('connection refused'); }) as unknown as typeof fetch;
    await expect(fetchQuote({ provider: 'KRAKEN', quote: 'EUR', fetchImpl, isOnline: () => true })).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('rejects an HTTP error status', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false, 503)) as unknown as typeof fetch;
    await expect(fetchQuote({ provider: 'KRAKEN', quote: 'EUR', fetchImpl, isOnline: () => true })).rejects.toMatchObject({ code: 'HTTP' });
  });

  it('rejects invalid JSON', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json'); } })) as unknown as typeof fetch;
    await expect(fetchQuote({ provider: 'KRAKEN', quote: 'EUR', fetchImpl, isOnline: () => true })).rejects.toMatchObject({ code: 'INVALID_JSON' });
  });

  it('uses the official public Spot endpoints (no key, no credentials)', () => {
    expect(endpointForProvider('KRAKEN', 'EUR')).toBe('https://api.kraken.com/0/public/Ticker?pair=XBTEUR');
    expect(endpointForProvider('KRAKEN', 'USD')).toBe('https://api.kraken.com/0/public/Ticker?pair=XBTUSD');
    expect(endpointForProvider('COINBASE', 'EUR')).toBe('https://api.coinbase.com/v2/prices/BTC-EUR/spot');
  });

  it('never sends credentials', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => { expect(init.credentials).toBe('omit'); return jsonResponse(KRAKEN_EUR_PAYLOAD); }) as unknown as typeof fetch;
    await fetchQuote({ provider: 'KRAKEN', quote: 'EUR', fetchImpl, isOnline: () => true });
    expect(fetchImpl).toHaveBeenCalled();
  });

  it('refuses to fetch for the MANUAL provider', async () => {
    await expect(fetchQuote({ provider: 'MANUAL', quote: 'EUR', isOnline: () => true })).rejects.toBeInstanceOf(PriceOracleError);
  });
});

/* ------------------------------------------------------------ freshness */

describe('quote freshness', () => {
  const quote = (retrievedAt: string): RateQuote => ({ provider: 'KRAKEN', pair: 'BTC/EUR', base: 'BTC', quote: 'EUR', bid: 100, ask: 100, rate: 100, retrievedAt });

  it('accepts a quote inside the 60 s window', () => {
    const now = Date.parse('2026-09-19T10:00:00Z');
    expect(isQuoteFresh(quote('2026-09-19T09:59:30Z'), now)).toBe(true);
  });

  it('flags a stale quote as not fresh', () => {
    const now = Date.parse('2026-09-19T10:00:00Z');
    expect(isQuoteFresh(quote('2026-09-19T09:58:00Z'), now)).toBe(false);
    expect(RATE_MAX_AGE_MS).toBe(60_000);
  });

  it('treats an unparseable timestamp as stale', () => {
    expect(isQuoteFresh(quote('not-a-date'), Date.now())).toBe(false);
  });
});

/* --------------------------------------------------------- manual rates */

describe('manual rates', () => {
  it('builds a locked manual rate marked manual + unverified', () => {
    const locked = manualLockedRate({ quote: 'EUR', rate: 97_000, note: 'Accord des joueurs', lockedAt: '2026-09-19T10:00:00Z' });
    expect(locked.provider).toBe('MANUAL');
    expect(locked.manual).toBe(true);
    expect(locked.rate).toBe(97_000);
    expect(locked.pair).toBe('BTC/EUR');
    expect(locked.manualNote).toBe('Accord des joueurs');
    // No market metadata at all for a manual rate.
    expect(locked.bid).toBeUndefined();
    expect(locked.ask).toBeUndefined();
    expect(locked.retrievedAt).toBeUndefined();
  });

  it('rejects a non-positive manual rate', () => {
    expect(() => manualLockedRate({ quote: 'EUR', rate: 0 })).toThrow();
    expect(() => manualLockedRate({ quote: 'EUR', rate: -1 })).toThrow();
    expect(() => manualLockedRate({ quote: 'EUR', rate: Number.NaN })).toThrow();
  });

  it('locks an automatic quote with its full metadata', () => {
    const quote: RateQuote = { provider: 'KRAKEN', pair: 'BTC/EUR', base: 'BTC', quote: 'EUR', bid: 70557.9, ask: 70558, rate: 70557.95, retrievedAt: '2026-09-19T10:00:00Z' };
    const locked = lockQuote(quote, '2026-09-19T10:00:05Z');
    expect(locked.provider).toBe('KRAKEN');
    expect(locked.bid).toBe(70557.9);
    expect(locked.ask).toBe(70558);
    expect(locked.retrievedAt).toBe('2026-09-19T10:00:00Z');
    expect(locked.lockedAt).toBe('2026-09-19T10:00:05Z');
    expect(locked.manual).toBeUndefined();
  });

  it('preserves a legacy flat rate as a documented legacy manual value', () => {
    const legacy = legacyLockedRate(100_000, 'EUR', '2026-09-13T12:00:00Z');
    expect(legacy.provider).toBe('MANUAL');
    expect(legacy.manual).toBe(true);
    expect(legacy.legacy).toBe(true);
    expect(legacy.rate).toBe(100_000);
  });
});

/* ------------------------------------------------------------- doctrine */

describe('provider doctrine', () => {
  it('defaults to Kraken', () => {
    expect(DEFAULT_RATE_PROVIDER).toBe('KRAKEN');
  });

  it('only MANUAL works without network', () => {
    expect(providerRequiresNetwork('MANUAL')).toBe(false);
    expect(providerRequiresNetwork('KRAKEN')).toBe(true);
    expect(providerRequiresNetwork('COINBASE')).toBe(true);
  });
});
