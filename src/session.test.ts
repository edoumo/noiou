import { describe, expect, it } from 'vitest';
import { clearSession, createEmptySession, loadSession, parseSession, saveSession, SESSION_STORAGE_KEY } from './session';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem(key: string) { return data.get(key) ?? null; },
    setItem(key: string, value: string) { data.set(key, value); },
    removeItem(key: string) { data.delete(key); },
  };
}

describe('session persistence', () => {
  it('round-trips a versioned session snapshot', () => {
    const storage = memoryStorage();
    const snapshot = createEmptySession('2026-09-13T12:00:00Z');
    snapshot.stacks = { alice: 42 };
    saveSession(storage, snapshot);
    expect(storage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
    expect(loadSession(storage)).toEqual(snapshot);
  });

  it('rejects an unknown schema version', () => {
    expect(() => parseSession(JSON.stringify({ schemaVersion: 99 }))).toThrow(/Unsupported/);
  });

  it('rejects malformed collections instead of guessing', () => {
    const snapshot = createEmptySession('2026-09-13T12:00:00Z') as unknown as Record<string, unknown>;
    snapshot.players = 'Alice';
    expect(() => parseSession(JSON.stringify(snapshot))).toThrow(/collections/);
  });

  it('clears only the NOIOU session key', () => {
    const storage = memoryStorage();
    storage.setItem('other', 'keep');
    saveSession(storage, createEmptySession());
    clearSession(storage);
    expect(storage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(storage.getItem('other')).toBe('keep');
  });
});
