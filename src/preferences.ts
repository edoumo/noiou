export const SUPPORTED_LOCALES = [
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
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]['code'];

export interface UserPreferences {
  locale: SupportedLocale;
  vibrateOnPress: boolean;
  clickSound: boolean;
  financialSound: boolean;
}

export const PREFERENCE_STORAGE_KEY = 'noiou.preferences.v1';

export const DEFAULT_PREFERENCES: UserPreferences = {
  locale: 'fr-FR',
  vibrateOnPress: false,
  clickSound: false,
  financialSound: false,
};

const supportedLocaleSet = new Set<string>(SUPPORTED_LOCALES.map((locale) => locale.code));

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && supportedLocaleSet.has(value);
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
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function saveUserPreferences(storage: Pick<Storage, 'setItem'>, preferences: UserPreferences): void {
  storage.setItem(PREFERENCE_STORAGE_KEY, JSON.stringify(preferences));
}

export function isFinancialActionLabel(label: string): boolean {
  const normalized = label.toLocaleLowerCase('fr-FR').replace(/\s+/g, ' ').trim();
  return /(rebuy|cave|encaisse|paiement|payout|tip|rémunération|remuneration|reçu|recu|received|settle|règlement)/i.test(normalized);
}

export type PreferenceUiKey =
  | 'settings'
  | 'language'
  | 'languageNote'
  | 'vibration'
  | 'vibrationNote'
  | 'clickSound'
  | 'clickSoundNote'
  | 'financialSound'
  | 'financialSoundNote';

const preferenceCatalog: Record<'fr' | 'en', Record<PreferenceUiKey, string>> = {
  fr: {
    settings: 'Réglages',
    language: 'Langue',
    languageNote: 'L’infrastructure multilingue est active. Pendant l’alpha, l’application reste encore majoritairement en français ; les catalogues complets seront finalisés avant la diffusion publique.',
    vibration: 'Vibration à l’appui',
    vibrationNote: 'Retour haptique local sur les appareils compatibles.',
    clickSound: 'Son des boutons',
    clickSoundNote: 'Petit clic généré localement après une action utilisateur.',
    financialSound: 'Son financier renforcé',
    financialSoundNote: 'Signal distinct pour les boutons de cave, rebuy, encaissement et règlement.',
  },
  en: {
    settings: 'Settings',
    language: 'Language',
    languageNote: 'The multilingual foundation is active. During the alpha the app is still mostly French; complete language catalogs will be finished before public release.',
    vibration: 'Vibrate on press',
    vibrationNote: 'Local haptic feedback on compatible devices.',
    clickSound: 'Button sound',
    clickSoundNote: 'A small locally generated click after a user action.',
    financialSound: 'Enhanced payment sound',
    financialSoundNote: 'A distinct signal for buy-in, rebuy, receipt and settlement actions.',
  },
};

export function preferenceText(locale: SupportedLocale, key: PreferenceUiKey): string {
  return preferenceCatalog[locale.startsWith('fr') ? 'fr' : 'en'][key];
}
