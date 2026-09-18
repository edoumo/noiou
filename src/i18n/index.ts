/**
 * i18n runtime engine (NOIOU).
 *
 * Pure functions — no React, no network. Every locale is embedded in the build
 * (imported statically), so translations work fully offline: no runtime API
 * call, no dependency on an external service.
 */
import type { Catalog, LocaleCode, TranslationParams } from './types';
import { frFRCatalog } from './catalogs/fr-FR';
import { DEFAULT_LOCALE, isPublicLocale, resolvePublicLocale } from './locales';
import { catalogs } from './catalogs';

/** Matches a named placeholder such as `{player}` or `{count}`. */
const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Active locale for non-React callers.
 *
 * Pure modules (validators, Lightning helpers, parsers) throw user-facing
 * errors long before a React context lookup is possible, so the engine keeps a
 * module-level locale that `I18nProvider` keeps in sync. React components
 * should always prefer `useI18n()`; this mirror exists so error copy raised
 * from plain functions still follows the selected language.
 */
let activeLocale: LocaleCode = DEFAULT_LOCALE;

/** Set the locale used by `translate()` when no explicit locale is passed. */
export function setActiveLocale(locale: string): void {
  activeLocale = hasCatalog(locale) && isPublicLocale(locale) ? locale : DEFAULT_LOCALE;
}

/** Read the locale currently used by `translate()` by default. */
export function getActiveLocale(): LocaleCode {
  return activeLocale;
}

/** Reset the module-level locale. Test seam. */
export function resetActiveLocale(): void {
  activeLocale = DEFAULT_LOCALE;
}

/** Interpolate named placeholders in a template.
 * Unknown placeholders are left as-is so a missing parameter is visible in QA
 * instead of rendering `undefined` silently.
 */
export function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(PLACEHOLDER, (match, name: string) => {
    const value = params[name];
    return value === undefined || value === null ? match : String(value);
  });
}

/** Look up a key in one catalog, falling back to the reference catalog. */
export function lookup(key: string, locale: LocaleCode = activeLocale): string {
  const requested = catalogs[locale];
  const found = requested?.[key];
  if (typeof found === 'string' && found.length > 0) return found;
  const reference = frFRCatalog[key as keyof typeof frFRCatalog];
  return typeof reference === 'string' ? reference : key;
}

/**
 * Translate a key with optional named parameters.
 *
 * The fallback chain is deliberate: a locale that lacks a key falls back to the
 * reference catalog rather than showing a raw key, but the catalog gate test
 * guarantees this never happens for a PUBLIC locale.
 */
export function translate(key: string, params?: TranslationParams, locale: LocaleCode = activeLocale): string {
  return interpolate(lookup(key, locale), params);
}

/**
 * Shorthand alias for `translate()` used across the app.
 * Modules import `t` and always resolve against the active locale.
 */
export function t(key: string, params?: TranslationParams): string {
  return translate(key, params);
}

/** Locale-aware number formatting (never changes the underlying value). */
export function formatNumber(value: number, locale: LocaleCode, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/** Locale-aware currency formatting (display only — the business value is untouched). */
export function formatCurrency(value: number, currency: string, locale: LocaleCode): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
}

/**
 * Format a game amount with the player's locale:
 * - SATS render as `1 234 sats` using the locale's grouping;
 * - fiat renders with the locale's currency rules (EUR, USD, …).
 */
export function formatAmount(value: number, currency: string, locale: LocaleCode): string {
  if (currency === 'SATS') return `${formatNumber(Math.round(value), locale)} sats`;
  return formatCurrency(value, currency, locale);
}

/** Locale-aware time formatting (e.g. the autosave timestamp). */
export function formatTime(iso: string, locale: LocaleCode): string {
  return new Date(iso).toLocaleTimeString(locale);
}

/** Locale-aware date formatting. */
export function formatDate(iso: string, locale: LocaleCode, options?: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleDateString(locale, options);
}

/** True when a complete catalog is embedded for this locale. */
export function hasCatalog(locale: string): boolean {
  return Boolean(catalogs[locale]);
}

/**
 * Resolve the locale actually used for rendering.
 * Only public locales (complete catalogs) are honoured; anything else falls back
 * to the default so an incomplete language can never be displayed.
 */
export function effectiveLocale(requested: unknown): LocaleCode {
  const resolved = resolvePublicLocale(requested);
  return hasCatalog(resolved) && isPublicLocale(resolved) ? resolved : DEFAULT_LOCALE;
}

export type { Catalog, LocaleCode, TranslationParams } from './types';
