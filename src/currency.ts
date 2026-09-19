/**
 * Central currency registry (NOIOU).
 *
 * One explicit table for everything currency-related, so no `if/else` chain
 * ever has to answer "how many decimals does this currency have?" or "which
 * currency should this locale suggest?" on its own.
 *
 * Design rules (product doctrine):
 * - a currency is only ever a DEFAULT before a game is created: the organizer
 *   can always pick another one, and a created game keeps its currency for
 *   good (nothing recalculates it from the locale afterwards);
 * - the default currency follows the locale's exact REGION, never a naive
 *   "Europe ⇒ EUR" rule (Bulgaria uses the euro since 2026-01-01, Denmark and
 *   Hungary do not; the table below says so line by line);
 * - `minorUnits` drives INPUT and ROUNDING only (`step=1` for zero-decimal
 *   currencies, never a blanket `step=0.01`). DISPLAY always goes through
 *   `Intl.NumberFormat(locale, { style: 'currency', currency })`, which carries
 *   its own per-locale rules;
 * - `oracleEligible` is derived from the price oracle's provider capability
 *   table (`providerSupportsCurrency`) so there is a single source of truth for
 *   "can an automatic source quote BTC in this currency?".
 */
import type { Currency, FiatCurrency } from './domain';
import { automaticProvidersForCurrency } from './priceOracle';

/** How a currency behaves in arithmetic and input fields. */
export type CurrencyKind = 'FIAT' | 'SATS';

export interface CurrencyDescriptor {
  readonly code: Currency;
  /** i18n key of the localized display name (e.g. `currency.EUR.label`). */
  readonly labelKey: string;
  readonly kind: CurrencyKind;
  /**
   * Decimal places used for INPUT validation and amount ROUNDING.
   * ISO 4217 defines HUF with 2 decimals (the historical fillér), but no
   * fillér has been in circulation since 1999 and payment systems treat HUF as
   * a zero-decimal currency in practice — so the product follows real usage:
   * `0`. JPY and KRW are 0 by ISO. SATS are whole units by nature.
   */
  readonly minorUnits: 0 | 2;
  /** ISO 4217 symbol, kept for documentation/fallback display. Real display uses Intl. */
  readonly symbol: string;
  /** True when at least one automatic provider can quote BTC in this currency. */
  readonly oracleEligible: boolean;
}

/** Display order of the currency selector (matches the mandate §20). */
export const SUPPORTED_CURRENCY_CODES: readonly Currency[] = [
  'SATS',
  'EUR',
  'USD',
  'GBP',
  'DKK',
  'HUF',
  'JPY',
  'KRW',
] as const;

/**
 * The fiat currencies a public locale's region actually uses.
 * Exact region mapping — deliberately NOT a geography heuristic.
 */
export const DEFAULT_CURRENCY_BY_LOCALE: Readonly<Record<string, FiatCurrency>> = {
  'fr-FR': 'EUR',
  'en-GB': 'GBP',
  'en-US': 'USD',
  'de-DE': 'EUR',
  'es-ES': 'EUR',
  'it-IT': 'EUR',
  'pt-PT': 'EUR',
  'da-DK': 'DKK',
  'hr-HR': 'EUR',
  // Bulgaria adopted the euro on 2026-01-01: EUR, never BGN.
  'bg-BG': 'EUR',
  'el-GR': 'EUR',
  'fi-FI': 'EUR',
  'hu-HU': 'HUF',
  'ja-JP': 'JPY',
  'ko-KR': 'KRW',
} as const;

const DESCRIPTOR_ROWS: readonly Omit<CurrencyDescriptor, 'oracleEligible'>[] = [
  { code: 'SATS', labelKey: 'currency.SATS.label', kind: 'SATS', minorUnits: 0, symbol: 'sats' },
  { code: 'EUR', labelKey: 'currency.EUR.label', kind: 'FIAT', minorUnits: 2, symbol: '€' },
  { code: 'USD', labelKey: 'currency.USD.label', kind: 'FIAT', minorUnits: 2, symbol: '$' },
  { code: 'GBP', labelKey: 'currency.GBP.label', kind: 'FIAT', minorUnits: 2, symbol: '£' },
  { code: 'DKK', labelKey: 'currency.DKK.label', kind: 'FIAT', minorUnits: 2, symbol: 'kr' },
  { code: 'HUF', labelKey: 'currency.HUF.label', kind: 'FIAT', minorUnits: 0, symbol: 'Ft' },
  { code: 'JPY', labelKey: 'currency.JPY.label', kind: 'FIAT', minorUnits: 0, symbol: '¥' },
  { code: 'KRW', labelKey: 'currency.KRW.label', kind: 'FIAT', minorUnits: 0, symbol: '₩' },
];

/** The central registry, keyed by ISO code. */
export const CURRENCY_REGISTRY: Readonly<Record<Currency, CurrencyDescriptor>> = Object.freeze(
  Object.fromEntries(DESCRIPTOR_ROWS.map((row) => [
    row.code,
    Object.freeze({ ...row, oracleEligible: automaticProvidersForCurrency(row.code).length > 0 }),
  ])) as Record<Currency, CurrencyDescriptor>,
);

/** Registered currencies in display order. */
export const SUPPORTED_CURRENCIES: readonly CurrencyDescriptor[] = SUPPORTED_CURRENCY_CODES.map((code) => CURRENCY_REGISTRY[code]);

const SUPPORTED_SET = new Set<string>(SUPPORTED_CURRENCY_CODES);

/** True when a stored/typed value is a supported currency code. */
export function isSupportedCurrency(value: unknown): value is Currency {
  return typeof value === 'string' && SUPPORTED_SET.has(value);
}

/** True when the currency is a fiat currency (everything but the native sats unit). */
export function isFiatCurrencyCode(value: unknown): value is FiatCurrency {
  return isSupportedCurrency(value) && value !== 'SATS';
}

/** Registry entry for a currency; unknown codes yield `undefined`. */
export function currencyDescriptor(code: string): CurrencyDescriptor | undefined {
  return isSupportedCurrency(code) ? CURRENCY_REGISTRY[code] : undefined;
}

/** Minor units (decimal places) of a currency: 2 for EUR/USD/GBP/DKK, 0 for HUF/JPY/KRW/SATS. */
export function minorUnitsFor(code: Currency): 0 | 2 {
  return CURRENCY_REGISTRY[code].minorUnits;
}

/** True when amounts in this currency are whole units. */
export function isZeroDecimalCurrency(code: Currency): boolean {
  return CURRENCY_REGISTRY[code].minorUnits === 0;
}

/**
 * Input step for an amount field: `1` for zero-decimal currencies, `0.01`
 * otherwise. Never a blanket `step=0.01` (mandate §7).
 */
export function amountStepFor(code: Currency): number {
  return isZeroDecimalCurrency(code) ? 1 : 0.01;
}

/**
 * Round an amount to the smallest usable unit of its currency.
 * This is the single rounding used by settlement, tips and dealer compensation.
 */
export function roundForCurrency(value: number, code: Currency): number {
  if (!Number.isFinite(value)) return value;
  if (isZeroDecimalCurrency(code)) return Math.round(value);
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Default currency for a locale, by exact region.
 * An unknown locale yields no default (the caller keeps what it has).
 */
export function defaultCurrencyForLocale(locale: string): FiatCurrency | undefined {
  return DEFAULT_CURRENCY_BY_LOCALE[locale];
}

/* ------------------------------------------------ creation-time preference */

/**
 * How the NEXT game creation picks its currency:
 * - `auto: true`  — follow the active locale's default (and keep following it
 *   when the language changes);
 * - `auto: false` — the organizer picked a currency explicitly; changing the
 *   language must never silently replace it.
 *
 * Persisted separately from the game itself: a created game keeps its own
 * currency for good (`game.currency` is immutable), this only shapes the
 * suggestion on the next creation form.
 */
export interface CreationCurrencyPreference {
  auto: boolean;
  currency: Currency;
}

export const CREATION_CURRENCY_STORAGE_KEY = 'noiou.currency.v1';

export function resolveCreationCurrency(
  preference: CreationCurrencyPreference | null,
  locale: string,
): CreationCurrencyPreference {
  const fallback = defaultCurrencyForLocale(locale) ?? 'EUR';
  if (preference && !preference.auto && isSupportedCurrency(preference.currency)) return preference;
  return { auto: true, currency: fallback };
}

export function loadCreationCurrencyPreference(
  storage: Pick<Storage, 'getItem'>,
): CreationCurrencyPreference | null {
  try {
    const raw = storage.getItem(CREATION_CURRENCY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CreationCurrencyPreference> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.auto !== 'boolean' || !isSupportedCurrency(parsed.currency)) return null;
    return { auto: parsed.auto, currency: parsed.currency };
  } catch {
    return null;
  }
}

export function saveCreationCurrencyPreference(
  storage: Pick<Storage, 'setItem'>,
  preference: CreationCurrencyPreference,
): void {
  try {
    storage.setItem(CREATION_CURRENCY_STORAGE_KEY, JSON.stringify(preference));
  } catch {
    /* private mode: the choice stays session-only */
  }
}
