/**
 * Rate-lock plan (NOIOU).
 *
 * Pure decision layer that turns the organizer's choice (preferred source,
 * manual value, last fetched quote) into the immutable rate metadata attached
 * to a game at creation. Kept apart from `priceOracle.ts` (which talks to the
 * network) so every decision here is unit-testable without I/O.
 *
 * Invariants:
 * - a SATS game carries NO BTC/fiat oracle at all;
 * - MANUAL never touches the network and never requires connectivity;
 * - an automatic source locks the MIDPOINT quote that was fetched for the
 *   current currency, and must be fresh (<= 60 s) at creation;
 * - nothing is ever invented: a missing/stale quote blocks creation and asks
 *   for an explicit refresh instead of silently degrading to manual.
 */
import type { Currency, FiatCurrency, Game } from './domain';
import {
  isQuoteFresh,
  legacyLockedRate,
  manualLockedRate,
  pairForQuote,
  providerRequiresNetwork,
  type LockedRate,
  type RateProviderId,
  type RateQuote,
} from './priceOracle';
import { isFiatCurrencyCode } from './currency';

export type { FiatCurrency };
export function isFiatCurrency(currency: string): currency is FiatCurrency {
  return isFiatCurrencyCode(currency);
}

export interface RatePlanInput {
  currency: Game['currency'];
  /** Source chosen for THIS creation (preference or per-creation override). */
  provider: RateProviderId;
  /** Manual rate as typed by the organizer (NaN / null when empty). */
  manualRate: number | null;
  manualNote: string;
  /** Explicit confirmation checkbox for a manual rate. */
  manualConfirmed: boolean;
  /** Last successful quote for the current currency & provider, if any. */
  quote: RateQuote | null;
  /** Injectable clock for freshness checks. */
  nowMs: number;
  /**
   * True when the game is declared cash-only: no Lightning feature will run,
   * so no BTC/fiat rate is needed at all. A cash-only fiat game then creates
   * fully offline with no oracle, no fetch and no lock (mandate §11/§12/§16).
   */
  cashOnly?: boolean;
}

export type RatePlan =
  | { kind: 'NONE' }
  | { kind: 'MANUAL'; locked: LockedRate }
  | { kind: 'AUTO'; locked: LockedRate }
  | { kind: 'NEEDS_QUOTE' }
  | { kind: 'BLOCKED'; code: 'MANUAL_RATE_MISSING' | 'MANUAL_RATE_INVALID' | 'MANUAL_CONFIRM_REQUIRED' | 'QUOTE_STALE' | 'QUOTE_MISSING' };

/**
 * Decide whether a game creation may proceed and what rate gets locked.
 *
 * `NEEDS_QUOTE` means "an automatic quote must be fetched before creating" —
 * the caller performs the fetch and re-plans; failure leaves the caller in an
 * explicit error state, never in a silent manual fallback.
 */
export function planRateLock(input: RatePlanInput): RatePlan {
  if (input.currency === 'SATS') return { kind: 'NONE' };
  if (!isFiatCurrency(input.currency)) return { kind: 'NONE' };
  // A cash-only game never converts to sats: no rate is required, and none is
  // locked. This is what lets any local fiat currency run fully offline.
  if (input.cashOnly) return { kind: 'NONE' };

  if (input.provider === 'MANUAL') {
    if (input.manualRate === null || Number.isNaN(input.manualRate)) return { kind: 'BLOCKED', code: 'MANUAL_RATE_MISSING' };
    if (!Number.isFinite(input.manualRate) || input.manualRate <= 0) return { kind: 'BLOCKED', code: 'MANUAL_RATE_INVALID' };
    if (!input.manualConfirmed) return { kind: 'BLOCKED', code: 'MANUAL_CONFIRM_REQUIRED' };
    return {
      kind: 'MANUAL',
      locked: manualLockedRate({
        quote: input.currency,
        rate: input.manualRate,
        note: input.manualNote,
        lockedAt: new Date(input.nowMs).toISOString(),
      }),
    };
  }

  if (!input.quote || input.quote.provider !== input.provider || input.quote.quote !== input.currency) {
    return { kind: 'NEEDS_QUOTE' };
  }
  if (!isQuoteFresh(input.quote, input.nowMs)) return { kind: 'BLOCKED', code: 'QUOTE_STALE' };
  return {
    kind: 'AUTO',
    locked: {
      provider: input.quote.provider,
      pair: input.quote.pair,
      base: 'BTC',
      quote: input.quote.quote,
      bid: input.quote.bid,
      ask: input.quote.ask,
      rate: input.quote.rate,
      retrievedAt: input.quote.retrievedAt,
      lockedAt: new Date(input.nowMs).toISOString(),
    },
  };
}

/**
 * Apply a locked rate to a game being created. This is the ONLY writer of
 * `game.lockedRate`: nothing else in the app ever mutates it, which is what
 * makes the lock durable against settings changes, reloads or navigation.
 */
export function applyLockedRateToGame<T extends Game>(game: T, locked: LockedRate | undefined): T {
  if (!locked) return { ...game, lockedBtcFiatRate: undefined, lockedRate: undefined };
  return { ...game, lockedBtcFiatRate: locked.rate, lockedRate: locked };
}

/**
 * Rate metadata of a game for display / export purposes.
 *
 * Legacy sessions and backups stored the plain `lockedBtcFiatRate` number with
 * no provider: they are surfaced as an explicitly documented legacy manual
 * rate (`provider: 'MANUAL'`, `legacy: true`) so the historical value is
 * preserved exactly and no provider is ever queried to "restore" it.
 */
export function effectiveLockedRate(game: Game | null | undefined): LockedRate | undefined {
  if (!game) return undefined;
  if (game.lockedRate) return game.lockedRate;
  if (!isFiatCurrency(game.currency)) return undefined;
  if (typeof game.lockedBtcFiatRate !== 'number' || !Number.isFinite(game.lockedBtcFiatRate) || game.lockedBtcFiatRate <= 0) return undefined;
  return legacyLockedRate(game.lockedBtcFiatRate, game.currency, game.createdAt);
}

/** True when the game's locked rate came from a manual (unverified) value. */
export function isManualLockedRate(locked: LockedRate | undefined): boolean {
  return Boolean(locked && (locked.provider === 'MANUAL' || locked.manual));
}

/**
 * Normalize a game restored from a legacy backup: synthesize the documented
 * legacy manual metadata when only `lockedBtcFiatRate` is present. Never calls
 * a provider — import must restore history, not refresh it.
 */
export function normalizeImportedGame(game: Game | null): Game | null {
  if (!game) return game;
  if (game.lockedRate) return game;
  if (!isFiatCurrency(game.currency)) return game;
  if (typeof game.lockedBtcFiatRate !== 'number' || !Number.isFinite(game.lockedBtcFiatRate) || game.lockedBtcFiatRate <= 0) return game;
  return { ...game, lockedRate: legacyLockedRate(game.lockedBtcFiatRate, game.currency, game.createdAt) };
}

/**
 * Ledger payload for the `PRICE_RATE_LOCKED` event.
 * Manual rates are immediately identifiable (`manual: true`).
 */
export function priceRateLockedPayload(locked: LockedRate): Record<string, unknown> {
  if (isManualLockedRate(locked)) {
    return {
      provider: 'MANUAL',
      rate: locked.rate,
      pair: locked.pair,
      quote: locked.quote,
      manual: true,
      lockedAt: locked.lockedAt,
      legacy: locked.legacy ?? false,
      note: locked.manualNote ?? null,
      verifiedByMarket: false,
    };
  }
  return {
    provider: locked.provider,
    pair: locked.pair,
    quote: locked.quote,
    bid: locked.bid ?? null,
    ask: locked.ask ?? null,
    rate: locked.rate,
    retrievedAt: locked.retrievedAt ?? null,
    lockedAt: locked.lockedAt,
    manual: false,
    verifiedByMarket: true,
  };
}

/** Human-friendly provider id for UI labels. */
export function providerIdForDisplay(locked: LockedRate): RateProviderId {
  if (isManualLockedRate(locked)) return 'MANUAL';
  return locked.provider;
}

/** True when the source needs the network at all (UI hints). */
export function sourceNeedsNetwork(provider: RateProviderId): boolean {
  return providerRequiresNetwork(provider);
}

/** The pair a creation would use, e.g. `BTC/EUR`. */
export function pairForCreation(currency: Currency): string | undefined {
  return isFiatCurrency(currency) ? pairForQuote(currency) : undefined;
}

/**
 * True when the game needs a BTC/fiat rate at all.
 *
 * A fiat game does NOT need one just because it exists: the rate is only
 * required when a Lightning feature actually has to convert an amount. A
 * purely cash fiat game (any supported currency) runs fully offline with no
 * oracle, no fetch and no lock.
 */
export function needsBtcFiatRate(currency: Currency, lightningInUse: boolean): boolean {
  return isFiatCurrency(currency) && lightningInUse;
}

/**
 * True when a Lightning feature on this game would need a conversion, i.e. the
 * game is fiat and some Lightning path is selected or configured.
 */
export function gameUsesLightning(game: Game): boolean {
  return Boolean(
    game.lightningReceiveMode
    || game.organizerLightningDestination
    || game.dealer.lightningAddress
    || game.dealer.preferredPayment === 'LIGHTNING',
  );
}
