/**
 * I18nProvider / useI18n (NOIOU).
 *
 * The provider owns the active locale, persists the user's choice (separate
 * storage key from the older preference payload) and exposes a `t()` function
 * plus locale-aware formatters.
 *
 * Guarantees:
 * - only PUBLIC locales (complete catalogs) can become active;
 * - `document.documentElement.lang` always reflects the active locale;
 * - the selector choice survives reloads;
 * - no network access at any point.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  effectiveLocale,
  formatAmount as formatAmountWith,
  formatCurrency,
  formatDate,
  formatNumber,
  formatTime,
  setActiveLocale,
  translate,
} from './index';
import { DEFAULT_LOCALE, PUBLIC_LOCALES, isPublicLocale } from './locales';
import type { LocaleCode, TranslationParams } from './types';

export const LOCALE_STORAGE_KEY = 'noiou.locale.v1';

export interface I18nValue {
  /** Active locale code (always a public locale). */
  readonly locale: LocaleCode;
  /** Registered locales whose catalogs are complete — the only selectable ones. */
  readonly publicLocales: typeof PUBLIC_LOCALES;
  /** Translate a key with optional named placeholders. */
  readonly t: (key: string, params?: TranslationParams) => string;
  /** Switch the active locale (ignored when the locale is not public). */
  readonly setLocale: (locale: LocaleCode) => void;
  /** Locale-aware formatters, bound to the active locale. */
  readonly formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  readonly formatCurrency: (value: number, currency: string) => string;
  readonly formatAmount: (value: number, currency: string) => string;
  readonly formatTime: (iso: string) => string;
  readonly formatDate: (iso: string, options?: Intl.DateTimeFormatOptions) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function readStoredLocale(storage?: Pick<Storage, 'getItem'>): LocaleCode {
  if (!storage) return DEFAULT_LOCALE;
  try {
    const raw = storage.getItem(LOCALE_STORAGE_KEY);
    return isPublicLocale(raw) ? raw : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export interface I18nProviderProps {
  children: ReactNode;
  /** Test seam: inject a storage stub. Defaults to `window.localStorage`. */
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  /** Test seam: initial locale override (still validated against public locales). */
  initialLocale?: LocaleCode;
}

export function I18nProvider({ children, storage, initialLocale }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<LocaleCode>(() => (
    initialLocale ? effectiveLocale(initialLocale) : readStoredLocale(storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined))
  ));

  // Keep <html lang> in sync with the active locale: this is what screen
  // readers, spell checkers and the browser's own text rendering use.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = locale;
  }, [locale]);

  // Mirror the active locale into the engine so user-facing errors thrown by
  // pure modules (validators, Lightning helpers) follow the same language.
  useEffect(() => {
    setActiveLocale(locale);
  }, [locale]);

  const setLocale = useCallback((next: LocaleCode) => {
    // Hard gate: an incomplete locale can never be activated at runtime.
    if (!isPublicLocale(next)) return;
    setLocaleState(next);
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    try {
      target?.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      /* private mode: the choice stays session-only */
    }
  }, [storage]);

  const value = useMemo<I18nValue>(() => ({
    locale,
    publicLocales: PUBLIC_LOCALES,
    t: (key, params) => translate(key, params, locale),
    setLocale,
    formatNumber: (amount, options) => formatNumber(amount, locale, options),
    formatCurrency: (amount, currency) => formatCurrency(amount, currency, locale),
    formatAmount: (amount, currency) => formatAmountWith(amount, currency, locale),
    formatTime: (iso) => formatTime(iso, locale),
    formatDate: (iso, options) => formatDate(iso, locale, options),
  }), [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Access the active i18n context. */
export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside an I18nProvider');
  return value;
}
