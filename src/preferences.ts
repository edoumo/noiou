import { REGISTERED_LOCALES, isRegisteredLocale, localeDescriptor } from './i18n/locales';
import { catalogs } from './i18n/catalogs';
import { t } from './i18n';
import { DEFAULT_RATE_PROVIDER, PRICE_PROVIDER_IDS, type RateProviderId } from './priceOracle';
import type { LocaleCode } from './i18n/types';
import type { SupportedLocale } from './i18n/locales';

/**
 * Backwards-compatible alias. The authoritative registry now lives in
 * `src/i18n/locales.ts`; `SUPPORTED_LOCALES` is kept for existing callers.
 */
export const SUPPORTED_LOCALES = REGISTERED_LOCALES;

export type { SupportedLocale };

export interface UserPreferences {
  /** Stored locale code (validated against the registry on load). */
  locale: LocaleCode;
  vibrateOnPress: boolean;
  clickSound: boolean;
  financialSound: boolean;
  /**
   * Preferred BTC/fiat rate source for the NEXT game. Persisted locally and
   * deliberately independent from any active game: changing it never alters a
   * rate that was already locked at creation.
   */
  rateProvider: RateProviderId;
}

export const PREFERENCE_STORAGE_KEY = 'noiou.preferences.v1';

export const DEFAULT_PREFERENCES: UserPreferences = {
  locale: 'fr-FR',
  vibrateOnPress: false,
  clickSound: false,
  financialSound: false,
  rateProvider: DEFAULT_RATE_PROVIDER,
};

/** True when a stored value is a known rate source. */
export function isRateProviderId(value: unknown): value is RateProviderId {
  return typeof value === 'string' && (PRICE_PROVIDER_IDS as readonly string[]).includes(value);
}

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return isRegisteredLocale(value);
}

export function loadUserPreferences(storage: Pick<Storage, 'getItem'>): UserPreferences {
  const raw = storage.getItem(PREFERENCE_STORAGE_KEY);
  if (!raw) return { ...DEFAULT_PREFERENCES };

  try {
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      locale: isSupportedLocale(parsed.locale) ? parsed.locale : DEFAULT_PREFERENCES.locale,
      vibrateOnPress: typeof parsed.vibrateOnPress === 'boolean' ? parsed.vibrateOnPress : DEFAULT_PREFERENCES.vibrateOnPress,
      clickSound: typeof parsed.clickSound === 'boolean' ? parsed.clickSound : DEFAULT_PREFERENCES.clickSound,
      financialSound: typeof parsed.financialSound === 'boolean' ? parsed.financialSound : DEFAULT_PREFERENCES.financialSound,
      // Unknown/missing values fall back to the default source (KRAKEN); every
      // other stored preference is preserved untouched.
      rateProvider: isRateProviderId(parsed.rateProvider) ? parsed.rateProvider : DEFAULT_PREFERENCES.rateProvider,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function saveUserPreferences(storage: Pick<Storage, 'setItem'>, preferences: UserPreferences): void {
  storage.setItem(PREFERENCE_STORAGE_KEY, JSON.stringify(preferences));
  // Notify live components (settings panel ⇄ game creation form) that the
  // persisted preference changed, so both stay in sync without a reload.
  if (typeof window !== 'undefined' && storage === window.localStorage) {
    window.dispatchEvent(new Event(PREFERENCES_SAVED_EVENT));
  }
}

/** Fired whenever the user preferences are persisted (see `saveUserPreferences`). */
export const PREFERENCES_SAVED_EVENT = 'noiou:preferences-saved';

/**
 * Keys whose buttons trigger the enhanced "financial" haptic/sound feedback.
 * Matching a label against several localized values is what makes the
 * classification work in every language, not just French.
 */
const FINANCIAL_KEYS = [
  'buyin.cash_received',
  'buyin.fromOrganizerWallet',
  'buyin.requestPayment',
  'rebuy.cash',
  'rebuy.fromOrganizerWallet',
  'rebuy.requestPayment',
  'collection.finishAndCount',
  'payout.confirmCash',
  'payout.dealerConfirmCash',
  'payout.retention.button',
  'tip.confirmCash',
  'settlement.close',
  'dialog.rebuy.confirm',
  'dialog.cashBuyIn.confirm',
  'dialog.organizerAllocation.confirm',
  'donation.record',
] as const;

/** Legacy French/English term list, kept so historical labels still classify. */
const LEGACY_FINANCIAL_PATTERN = /(rebuy|cave|encaisse|paiement|payout|tip|rémunération|remuneration|reçu|recu|received|settle|règlement)/i;

function normalizeLabel(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

/** Escape a template so only `{placeholder}` segments stay wildcards. */
function templateToRegExp(template: string): RegExp {
  const escaped = template
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\{\w+\}/g, '.+');
  return new RegExp(escaped, 'i');
}

let financialMatchers: RegExp[] | null = null;

function buildFinancialMatchers(): RegExp[] {
  const matchers: RegExp[] = [];
  for (const catalog of Object.values(catalogs)) {
    for (const key of FINANCIAL_KEYS) {
      const value = catalog[key];
      if (typeof value === 'string' && value.trim()) matchers.push(templateToRegExp(normalizeLabel(value)));
    }
  }
  return matchers;
}

/**
 * Classify a button label as a financial action (buy-in, rebuy, receipt,
 * settlement, payout, tip) so the haptic/sound feedback can differ.
 *
 * Works language-independently: the label is matched against the localized
 * values of every financial button in every embedded catalog, with a legacy
 * term-based fallback for older labels.
 */
export function isFinancialActionLabel(label: string): boolean {
  const normalized = normalizeLabel(label);
  if (!normalized) return false;
  if (!financialMatchers) financialMatchers = buildFinancialMatchers();
  if (financialMatchers.some((matcher) => matcher.test(normalized))) return true;
  return LEGACY_FINANCIAL_PATTERN.test(normalized);
}

export type PreferenceUiKey =
  | 'settings'
  | 'language'
  | 'vibration'
  | 'vibrationNote'
  | 'clickSound'
  | 'clickSoundNote'
  | 'financialSound'
  | 'financialSoundNote';

const PREFERENCE_I18N_KEYS: Record<PreferenceUiKey, string> = {
  settings: 'prefs.settings',
  language: 'prefs.language',
  vibration: 'prefs.vibration',
  vibrationNote: 'prefs.vibrationNote',
  clickSound: 'prefs.clickSound',
  clickSoundNote: 'prefs.clickSoundNote',
  financialSound: 'prefs.financialSound',
  financialSoundNote: 'prefs.financialSoundNote',
};

/**
 * Resolve a settings label through the i18n engine.
 * The `languageNote` explanatory text was removed: a language offered by the
 * selector is now fully usable, so no "translations are coming later" copy may
 * be shown anywhere.
 */
export function preferenceText(locale: SupportedLocale, key: PreferenceUiKey): string {
  const descriptor = localeDescriptor(locale);
  void descriptor;
  return t(PREFERENCE_I18N_KEYS[key]);
}
