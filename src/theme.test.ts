import { describe, expect, it } from 'vitest';
import { loadThemePreference, resolveTheme, saveThemePreference, THEME_STORAGE_KEY } from './theme';

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('theme preference', () => {
  it('keeps AUTO tied to the system preference', () => {
    expect(resolveTheme('AUTO', true)).toBe('dark');
    expect(resolveTheme('AUTO', false)).toBe('light');
  });

  it('forces explicit light or dark mode', () => {
    expect(resolveTheme('LIGHT', true)).toBe('light');
    expect(resolveTheme('DARK', false)).toBe('dark');
  });

  it('persists only supported preferences and defaults to AUTO', () => {
    const storage = new MemoryStorage();
    expect(loadThemePreference(storage as Storage)).toBe('AUTO');
    saveThemePreference(storage as Storage, 'DARK');
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('DARK');
    expect(loadThemePreference(storage as Storage)).toBe('DARK');
    storage.setItem(THEME_STORAGE_KEY, 'BROKEN');
    expect(loadThemePreference(storage as Storage)).toBe('AUTO');
  });
});
