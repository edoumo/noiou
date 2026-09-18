import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  PREFERENCE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  isFinancialActionLabel,
  loadUserPreferences,
  saveUserPreferences,
} from './preferences';

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('user preferences', () => {
  it('defaults safely when no persisted value exists', () => {
    const storage = new MemoryStorage();
    expect(loadUserPreferences(storage)).toEqual(DEFAULT_PREFERENCES);
  });

  it('persists and restores preferences', () => {
    const storage = new MemoryStorage();
    const next = { locale: 'ja-JP' as const, vibrateOnPress: true, clickSound: true, financialSound: false, rateProvider: 'KRAKEN' as const };
    saveUserPreferences(storage, next);
    expect(storage.getItem(PREFERENCE_STORAGE_KEY)).toBeTruthy();
    expect(loadUserPreferences(storage)).toEqual(next);
  });

  it('falls back on invalid or unsupported persisted values', () => {
    const storage = new MemoryStorage();
    storage.setItem(PREFERENCE_STORAGE_KEY, JSON.stringify({ locale: 'xx-XX', vibrateOnPress: 'yes' }));
    expect(loadUserPreferences(storage)).toEqual(DEFAULT_PREFERENCES);
  });
});

describe('locale registry', () => {
  it('keeps locale codes unique and includes the requested universal baseline', () => {
    const codes = SUPPORTED_LOCALES.map((locale) => locale.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const expected of ['fr-FR', 'en-GB', 'de-DE', 'es-ES', 'it-IT', 'pt-PT', 'da-DK', 'hr-HR', 'bg-BG', 'el-GR', 'fi-FI', 'hu-HU', 'ja-JP', 'ko-KR']) {
      expect(codes).toContain(expected);
    }
  });
});

describe('interaction feedback classification', () => {
  it('detects financial actions without treating ordinary buttons as financial', () => {
    expect(isFinancialActionLabel('+ Recave (rebuy) espèces')).toBe(true);
    expect(isFinancialActionLabel('Confirmer ce payout dans NOIOU')).toBe(true);
    expect(isFinancialActionLabel('Ajouter')).toBe(false);
    expect(isFinancialActionLabel('Exporter')).toBe(false);
  });
});
