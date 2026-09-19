/**
 * Price oracle (NOIOU).
 *
 * NOIOU needs a BTC/fiat rate to convert buy-ins / payouts between the game
 * currency (EUR/USD) and Lightning sats. The rate is LOCKED at game creation:
 * once a game exists, the provider, the pair and the rate are immutable.
 *
 * Design rules (product doctrine):
 * - The default automatic source is KRAKEN (public Spot API, no key).
 * - MANUAL is a first-class rescue mode, not a developer hack: a fully offline
 *   EUR/USD cash game must work end-to-end without any network access, and the
 *   organizer must be able to pick MANUAL BEFORE any Kraken attempt.
 * - NOIOU never invents a price: any fetch failure fails closed and offers
 *   explicit choices (retry / change source / use a manual rate). There is
 *   never a silent fallback to manual.
 * - SATS games use no BTC/fiat oracle at all.
 *
 * Purity: everything here is network-injectable. `fetch` is passed in (or
 * resolved from the global scope at call time) so unit tests never touch the
 * network and the offline path is provable.
 */
import type { Currency, FiatCurrency } from './domain';

export type RateProviderId = 'KRAKEN' | 'COINBASE' | 'MANUAL';

/** Providers offered by the settings UI, in display order. */
export const PRICE_PROVIDER_IDS: readonly RateProviderId[] = ['KRAKEN', 'COINBASE', 'MANUAL'];

/** The default automatic source. */
export const DEFAULT_RATE_PROVIDER: RateProviderId = 'KRAKEN';

/** Freshness window for an automatic quote, in milliseconds. */
export const RATE_MAX_AGE_MS = 60_000;

/** Providers that need the network. MANUAL never does. */
export function providerRequiresNetwork(provider: RateProviderId): boolean {
  return provider !== 'MANUAL';
}

/* ------------------------------------------ provider / currency capability */

/**
 * Automatic pairs each provider actually publishes, verified against the live
 * public APIs (2026-09-19):
 *
 * - KRAKEN `/0/public/AssetPairs` exposes BTC pairs in EUR, USD, GBP and JPY;
 *   asking it for DKK, HUF or KRW returns `EQuery:Unknown asset pair`;
 * - COINBASE `/v2/prices/BTC-{code}/spot` answers coherently for EUR, USD,
 *   GBP, DKK, HUF and KRW. Its BTC/JPY answer is NOT exploitable: on
 *   2026-09-19 the spot endpoint returned a flat `35600000` JPY per BTC while
 *   Coinbase's own `/v2/exchange-rates?currency=BTC` said `12755776` and
 *   Kraken's BTC/JPY midpoint sat at `12737924` — a 2.8x inconsistency, so
 *   JPY is deliberately marked unsupported at Coinbase rather than serving a
 *   wrong price. JPY stays covered by Kraken.
 *
 * This table is the single answer to `providerSupportsCurrency`, so the UI can
 * offer or refuse an automatic source per currency without guessing.
 */
export const PROVIDER_CURRENCY_SUPPORT: Readonly<Record<Exclude<RateProviderId, 'MANUAL'>, readonly string[]>> = Object.freeze({
  KRAKEN: Object.freeze(['EUR', 'USD', 'GBP', 'JPY']),
  COINBASE: Object.freeze(['EUR', 'USD', 'GBP', 'DKK', 'HUF', 'KRW']),
});

/** True when a provider publishes a BTC/<currency> pair usable for a quote. */
export function providerSupportsCurrency(provider: RateProviderId, currency: string): boolean {
  if (provider === 'MANUAL') return true; // a manual rate is possible for any currency
  return PROVIDER_CURRENCY_SUPPORT[provider].includes(currency);
}

/** Automatic providers able to quote BTC in this currency, in display order. */
export function automaticProvidersForCurrency(currency: string): RateProviderId[] {
  return PRICE_PROVIDER_IDS.filter((provider) => provider !== 'MANUAL' && providerSupportsCurrency(provider, currency));
}

/**
 * The automatic provider to prefer for a currency: the organizer preference
 * when it supports the currency, otherwise the first provider that does.
 * `undefined` means no automatic source exists for this currency — the UI must
 * then offer the explicit manual rate (never a silent cross rate).
 */
export function preferredAutomaticProvider(
  preferred: RateProviderId,
  currency: string,
): RateProviderId | undefined {
  if (preferred === 'MANUAL') return undefined;
  if (providerSupportsCurrency(preferred, currency)) return preferred;
  return automaticProvidersForCurrency(currency)[0];
}

/**
 * Locked rate metadata stored on the game (and in every backup).
 *
 * Kraken / Coinbase: provider + pair + bid + ask + rate + retrievedAt + lockedAt.
 * Manual: provider=MANUAL, rate, lockedAt, manual=true, optional note.
 */
export interface LockedRate {
  provider: RateProviderId;
  /** `BTC/EUR`, `BTC/GBP`, … */
  pair: string;
  base: 'BTC';
  quote: FiatCurrency;
  /** Present for automatic sources (KRAKEN / COINBASE). */
  bid?: number;
  ask?: number;
  /** Midpoint for automatic sources, organizer value for MANUAL. */
  rate: number;
  /** ISO timestamp of the market quote (automatic sources only). */
  retrievedAt?: string;
  /** ISO timestamp of the lock; immutable once the game exists. */
  lockedAt: string;
  /** True for a manual rate — never verified by a market source. */
  manual?: boolean;
  /** Optional organizer note about where a manual rate came from. */
  manualNote?: string;
  /**
   * Legacy marker: a backup created before the provider field existed only
   * carried `lockedBtcFiatRate`. On import it is restored as a legacy manual
   * rate so history is preserved byte-for-byte and NEVER refetched.
   */
  legacy?: boolean;
}

/** Error codes surfaced to the UI so it can offer the exact recovery actions. */
export type PriceOracleErrorCode =
  | 'OFFLINE'
  | 'NETWORK'
  | 'HTTP'
  | 'INVALID_JSON'
  | 'PAIR_MISSING'
  | 'PAIR_UNSUPPORTED'
  | 'INVALID_QUOTE'
  | 'STALE_QUOTE'
  | 'TIMEOUT';

/** A failure that never fabricates a price. */
export class PriceOracleError extends Error {
  constructor(readonly code: PriceOracleErrorCode, message: string, readonly provider: RateProviderId, readonly detail?: string) {
    super(message);
    this.name = 'PriceOracleError';
  }
}

export interface RateQuote {
  provider: RateProviderId;
  pair: string;
  base: 'BTC';
  quote: FiatCurrency;
  bid: number;
  ask: number;
  rate: number;
  retrievedAt: string;
}

export interface QuoteRequest {
  provider: RateProviderId;
  quote: FiatCurrency;
  /** Injected for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Injection seam for the network-reachability hint. */
  isOnline?: () => boolean;
  /** Injectable clock for freshness assertions. */
  now?: () => number;
  /** Abort a slow request instead of hanging the UI. */
  timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 8_000;

/* ------------------------------------------------------------------ pairs */

export function pairForQuote(quote: FiatCurrency): string {
  return `BTC/${quote}`;
}

/* ------------------------------------------------------- kraken + coinbase */

interface KrakenTickerEntry { a?: unknown[]; b?: unknown[] }

/**
 * Parse a Kraken `Ticker` response.
 *
 * The result key is not stable across pairs (`XXBTZEUR`, `XBTUSD`, …), so the
 * single value of `result` is used instead of guessing the key. Both `a` (ask)
 * and `b` (bid) must be present, finite and positive — otherwise the response
 * is rejected rather than partially trusted.
 */
export function parseKrakenTicker(payload: unknown, quote: FiatCurrency): { bid: number; ask: number } {
  const body = payload as { error?: unknown; result?: Record<string, KrakenTickerEntry> } | null;
  if (!body || typeof body !== 'object') throw new PriceOracleError('INVALID_JSON', 'Kraken response is not an object', 'KRAKEN');
  const errors = Array.isArray(body.error) ? body.error.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0) : [];
  if (errors.length > 0) throw new PriceOracleError('PAIR_MISSING', `Kraken error: ${errors.join(', ')}`, 'KRAKEN');
  const result = body.result;
  if (!result || typeof result !== 'object') throw new PriceOracleError('PAIR_MISSING', 'Kraken result is missing', 'KRAKEN');
  const entries = Object.entries(result).filter(([key]) => key !== 'last');
  if (entries.length === 0) throw new PriceOracleError('PAIR_MISSING', 'Kraken returned no pair', 'KRAKEN');
  const [, ticker] = entries[0];
  const askRaw = Array.isArray(ticker?.a) ? ticker.a[0] : undefined;
  const bidRaw = Array.isArray(ticker?.b) ? ticker.b[0] : undefined;
  const ask = Number(askRaw);
  const bid = Number(bidRaw);
  if (!Number.isFinite(bid) || bid <= 0) throw new PriceOracleError('INVALID_QUOTE', 'Kraken bid is invalid', 'KRAKEN', String(bidRaw));
  if (!Number.isFinite(ask) || ask <= 0) throw new PriceOracleError('INVALID_QUOTE', 'Kraken ask is invalid', 'KRAKEN', String(askRaw));
  void quote;
  return { bid, ask };
}

/**
 * Parse a Coinbase `v2/prices/{pair}/spot` response.
 *
 * Coinbase publishes a single spot value, so bid/ask are both this value and
 * the midpoint formula still applies (rate == spot). Kept identical in shape
 * to the Kraken parser so the oracle has one quote contract.
 */
export function parseCoinbaseSpot(payload: unknown): { bid: number; ask: number } {
  const body = payload as { data?: { amount?: unknown } } | null;
  if (!body || typeof body !== 'object' || !body.data || typeof body.data !== 'object') {
    throw new PriceOracleError('INVALID_JSON', 'Coinbase response is not an object', 'COINBASE');
  }
  const amount = Number(body.data.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new PriceOracleError('INVALID_QUOTE', 'Coinbase spot is invalid', 'COINBASE', String(body.data.amount));
  }
  return { bid: amount, ask: amount };
}

/** Midpoint of best bid / best ask — the single rate formula used everywhere. */
export function midpointRate(bid: number, ask: number): number {
  return (bid + ask) / 2;
}

/* -------------------------------------------------------------- endpoints */

const ENDPOINTS: Record<Exclude<RateProviderId, 'MANUAL'>, (quote: FiatCurrency) => string> = {
  KRAKEN: (quote) => `https://api.kraken.com/0/public/Ticker?pair=XBT${quote}`,
  COINBASE: (quote) => `https://api.coinbase.com/v2/prices/BTC-${quote}/spot`,
};

export function endpointForProvider(provider: RateProviderId, quote: FiatCurrency): string {
  if (provider === 'MANUAL') throw new PriceOracleError('NETWORK', 'MANUAL has no endpoint', 'MANUAL');
  return ENDPOINTS[provider](quote);
}

/* ------------------------------------------------------------- fetchQuote */

/**
 * Fetch a live BTC/fiat quote from an automatic provider.
 *
 * Fails closed on every abnormal condition. A browser-reported offline state
 * is used as a fast UX hint (fail immediately instead of waiting for a timeout)
 * but is never treated as proof: the fetch itself remains the authority.
 */
export async function fetchQuote(request: QuoteRequest): Promise<RateQuote> {
  const { provider, quote } = request;
  if (provider === 'MANUAL') throw new PriceOracleError('NETWORK', 'MANUAL is not an automatic provider', 'MANUAL');

  // Capability guard: a provider that publishes no BTC/<currency> pair must fail
  // closed BEFORE any network call, so the UI can offer the explicit manual
  // rate — never a silently derived cross rate.
  if (!providerSupportsCurrency(provider, quote)) {
    throw new PriceOracleError('PAIR_UNSUPPORTED', `No automatic source available for BTC/${quote}`, provider);
  }

  const online = request.isOnline ?? defaultIsOnline;
  if (!online()) {
    throw new PriceOracleError('OFFLINE', 'Internet connection unavailable', provider);
  }

  const doFetch = request.fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!doFetch) throw new PriceOracleError('NETWORK', 'No fetch implementation available', provider);

  const now = request.now ?? Date.now;
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  let response: Response;
  try {
    response = await doFetch(endpointForProvider(provider, quote), {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller?.signal,
      // The public price APIs are CORS-open; credentials must never be sent.
      credentials: 'omit',
    });
  } catch (error) {
    if (timer) clearTimeout(timer);
    const aborted = (error as { name?: string } | null)?.name === 'AbortError';
    throw new PriceOracleError(aborted ? 'TIMEOUT' : 'NETWORK', aborted ? 'Rate request timed out' : 'Rate request failed', provider, (error as Error | null)?.message);
  }
  if (timer) clearTimeout(timer);

  if (!response.ok) throw new PriceOracleError('HTTP', `Rate provider answered HTTP ${response.status}`, provider);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new PriceOracleError('INVALID_JSON', 'Rate provider returned invalid JSON', provider, (error as Error | null)?.message);
  }

  const { bid, ask } = provider === 'KRAKEN' ? parseKrakenTicker(payload, quote) : parseCoinbaseSpot(payload);
  const rate = midpointRate(bid, ask);
  if (!Number.isFinite(rate) || rate <= 0) throw new PriceOracleError('INVALID_QUOTE', 'Computed rate is invalid', provider);

  return {
    provider,
    pair: pairForQuote(quote),
    base: 'BTC',
    quote,
    bid,
    ask,
    rate,
    retrievedAt: new Date(now()).toISOString(),
  };
}

function defaultIsOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  // `navigator.onLine === false` is a reliable NEGATIVE signal on browsers that
  // expose it; a missing/undefined value must not block a real fetch attempt.
  return navigator.onLine !== false;
}

/** True when a quote is still within the freshness window. */
export function isQuoteFresh(quote: RateQuote, now: number = Date.now()): boolean {
  const retrieved = Date.parse(quote.retrievedAt);
  if (!Number.isFinite(retrieved)) return false;
  return now - retrieved <= RATE_MAX_AGE_MS;
}

/* ----------------------------------------------------------- manual rates */

export interface ManualRateInput {
  quote: FiatCurrency;
  rate: number;
  note?: string;
  lockedAt?: string;
}

export function manualLockedRate(input: ManualRateInput): LockedRate {
  if (!Number.isFinite(input.rate) || input.rate <= 0) {
    throw new Error('Manual rate must be a positive number');
  }
  const note = input.note?.trim();
  return {
    provider: 'MANUAL',
    pair: pairForQuote(input.quote),
    base: 'BTC',
    quote: input.quote,
    rate: input.rate,
    lockedAt: input.lockedAt ?? new Date().toISOString(),
    manual: true,
    manualNote: note ? note : undefined,
  };
}

/** Freeze a fetched automatic quote into the immutable locked-rate shape. */
export function lockQuote(quote: RateQuote, lockedAt: string = new Date().toISOString()): LockedRate {
  return {
    provider: quote.provider,
    pair: quote.pair,
    base: 'BTC',
    quote: quote.quote,
    bid: quote.bid,
    ask: quote.ask,
    rate: quote.rate,
    retrievedAt: quote.retrievedAt,
    lockedAt,
  };
}

/**
 * Build the locked rate for a game from the resolved creation-time inputs.
 * SATS games carry no BTC/fiat oracle at all.
 */
export function lockedRateForGame(currency: Currency, input: { manual: ManualRateInput } | { quote: RateQuote }): LockedRate | undefined {
  if (currency === 'SATS') return undefined;
  if ('manual' in input) return manualLockedRate(input.manual);
  return lockQuote(input.quote);
}

/* ----------------------------------------------- legacy backup rate import */

/**
 * Legacy backup compatibility: older backups stored only `lockedBtcFiatRate`,
 * a plain number with no provider. On import it is restored as an explicitly
 * documented `MANUAL` + `legacy` rate so the historical value is preserved
 * exactly and NEVER refetched from a provider.
 */
export function legacyLockedRate(rate: number, quote: FiatCurrency, lockedAt: string): LockedRate {
  return {
    provider: 'MANUAL',
    pair: pairForQuote(quote),
    base: 'BTC',
    quote,
    rate,
    lockedAt,
    manual: true,
    legacy: true,
  };
}

/** A human-readable provider label key for the UI. */
export function providerLabelKey(provider: RateProviderId): string {
  if (provider === 'KRAKEN') return 'rate.provider.kraken';
  if (provider === 'COINBASE') return 'rate.provider.coinbase';
  return 'rate.provider.manual';
}
