/**
 * Locale registry (NOIOU).
 *
 * Two explicit notions:
 *
 * - `REGISTERED_LOCALES` — every language the project knows about (32 entries).
 *   Registering a locale means it may appear in development/preview builds; it
 *   never appears in production unless its catalog is complete AND validated.
 *
 * - `PUBLIC_LOCALES` — the locales whose catalogs are complete at 100%, share
 *   exactly the same key set as `fr-FR`, contain no empty string and keep the
 *   same named placeholders. Only these are offered by the language selector in
 *   any build, and the catalog gate test (`src/i18n/catalogs.test.ts`) fails CI
 *   if a locale is declared public without meeting the bar.
 *
 * RULE: an incomplete language must never be visible in production.
 */
import type { LocaleCode, LocaleDescriptor } from './types';

export const REGISTERED_LOCALES = [
  { code: 'bg-BG', flag: '🇧🇬', name: 'Български' },
  { code: 'cs-CZ', flag: '🇨🇿', name: 'Čeština' },
  { code: 'da-DK', flag: '🇩🇰', name: 'Dansk' },
  { code: 'de-DE', flag: '🇩🇪', name: 'Deutsch' },
  { code: 'en-GB', flag: '🇬🇧', name: 'English' },
  { code: 'es-ES', flag: '🇪🇸', name: 'Español' },
  { code: 'fi-FI', flag: '🇫🇮', name: 'Suomi' },
  { code: 'fr-FR', flag: '🇫🇷', name: 'Français' },
  { code: 'el-GR', flag: '🇬🇷', name: 'Ελληνικά' },
  { code: 'hr-HR', flag: '🇭🇷', name: 'Hrvatski' },
  { code: 'hu-HU', flag: '🇭🇺', name: 'Magyar' },
  { code: 'it-IT', flag: '🇮🇹', name: 'Italiano' },
  { code: 'ja-JP', flag: '🇯🇵', name: '日本語' },
  { code: 'ko-KR', flag: '🇰🇷', name: '한국어' },
  { code: 'lv-LV', flag: '🇱🇻', name: 'Latviešu' },
  { code: 'lt-LT', flag: '🇱🇹', name: 'Lietuvių' },
  { code: 'nb-NO', flag: '🇳🇴', name: 'Norsk' },
  { code: 'nl-NL', flag: '🇳🇱', name: 'Nederlands' },
  { code: 'pl-PL', flag: '🇵🇱', name: 'Polski' },
  { code: 'pt-BR', flag: '🇧🇷', name: 'Português (Brasil)' },
  { code: 'pt-PT', flag: '🇵🇹', name: 'Português' },
  { code: 'ro-RO', flag: '🇷🇴', name: 'Română' },
  { code: 'ru-RU', flag: '🇷🇺', name: 'Русский' },
  { code: 'sl-SI', flag: '🇸🇮', name: 'Slovenščina' },
  { code: 'sk-SK', flag: '🇸🇰', name: 'Slovenčina' },
  { code: 'sv-SE', flag: '🇸🇪', name: 'Svenska' },
  { code: 'tr-TR', flag: '🇹🇷', name: 'Türkçe' },
  { code: 'uk-UA', flag: '🇺🇦', name: 'Українська' },
  { code: 'uz-UZ', flag: '🇺🇿', name: 'Oʻzbekcha' },
  { code: 'vi-VN', flag: '🇻🇳', name: 'Tiếng Việt' },
  { code: 'zh-CN', flag: '🇨🇳', name: '简体中文' },
  { code: 'zh-TW', flag: '🇹🇼', name: '繁體中文' },
] as const satisfies readonly LocaleDescriptor[];

/**
 * Locales that are fully translated and validated. Keep this list in sync with
 * `src/i18n/catalogs/index.ts` — the catalog gate test checks both directions
 * (a public locale without a complete catalog fails, and a complete catalog not
 * declared public is flagged if it is not intentionally pending QA).
 */
export const PUBLIC_LOCALE_CODES = [
  'fr-FR',
  'en-GB',
  'de-DE',
  'es-ES',
  'it-IT',
  'pt-PT',
  'da-DK',
  'hr-HR',
  'fi-FI',
  'hu-HU',
  'ja-JP',
  'ko-KR',
] as const;

export const DEFAULT_LOCALE: LocaleCode = 'fr-FR';

/**
 * Union of every registered locale code — the type accepted by the preference
 * store for backwards compatibility. Rendering always narrows to a PUBLIC
 * locale through `effectiveLocale()`.
 */
export type SupportedLocale = (typeof REGISTERED_LOCALES)[number]['code'];

const registeredByCode = new Map<string, LocaleDescriptor>(REGISTERED_LOCALES.map((locale) => [locale.code, locale]));
const publicSet = new Set<string>(PUBLIC_LOCALE_CODES);

export const PUBLIC_LOCALES: readonly LocaleDescriptor[] = REGISTERED_LOCALES.filter((locale) => publicSet.has(locale.code));

export function isRegisteredLocale(value: unknown): value is LocaleCode {
  return typeof value === 'string' && registeredByCode.has(value);
}

export function isPublicLocale(value: unknown): value is LocaleCode {
  return typeof value === 'string' && publicSet.has(value);
}

export function localeDescriptor(code: LocaleCode): LocaleDescriptor | undefined {
  return registeredByCode.get(code);
}

/**
 * Resolve any stored/requested locale to a safe public locale.
 * An incomplete (registered-only) or unknown locale always falls back to the
 * default so production can never render a partially translated UI.
 */
export function resolvePublicLocale(requested: unknown): LocaleCode {
  return isPublicLocale(requested) ? requested : DEFAULT_LOCALE;
}
