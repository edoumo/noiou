export type ThemePreference = 'AUTO' | 'LIGHT' | 'DARK';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'noiou.theme.v1';

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === 'DARK') return 'dark';
  if (preference === 'LIGHT') return 'light';
  return prefersDark ? 'dark' : 'light';
}

export function loadThemePreference(storage: Pick<Storage, 'getItem'>): ThemePreference {
  const value = storage.getItem(THEME_STORAGE_KEY);
  return value === 'LIGHT' || value === 'DARK' ? value : 'AUTO';
}

export function saveThemePreference(storage: Pick<Storage, 'setItem'>, preference: ThemePreference): void {
  storage.setItem(THEME_STORAGE_KEY, preference);
}

export function applyResolvedTheme(theme: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}
