import { describe, expect, it } from 'vitest';
import {
  clearSession,
  createEmptySession,
  loadSession,
  parseSession,
  saveSession,
  SESSION_STORAGE_KEY,
  sessionRequiresNwcReceipts,
  storageRequiresNwcReceipts,
} from './session';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem(key: string) { return data.get(key) ?? null; },
    setItem(key: string, value: string) { data.set(key, value); },
    removeItem(key: string) { data.delete(key); },
  };
}

function openGameSnapshot() {
  const snapshot = createEmptySession('2026-09-13T12:00:00Z');
  snapshot.game = {
    id: 'game-1',
    currency: 'SATS',
    buyInAmount: 1000,
    rebuyEnabled: true,
    rebuyAmount: 1000,
    chipValue: 1,
    status: 'OPEN',
    dealer: { enabled: false, mode: 'NONE' },
    createdAt: '2026-09-13T12:00:00Z',
  };
  return snapshot;
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

describe('live NWC mode recovery', () => {
  it('detects the durable GAME_CREATED NWC mode after reload', () => {
    const snapshot = openGameSnapshot();
    snapshot.ledger.push({
      id: 'event-1',
      gameId: 'game-1',
      sequence: 1,
      type: 'GAME_CREATED',
      at: '2026-09-13T12:00:00Z',
      payload: { lightningReceiveMode: 'NWC_RECEIVE_ONLY' },
      previousHash: '',
      hash: 'hash',
    });

    expect(sessionRequiresNwcReceipts(snapshot)).toBe(true);
  });

  it('uses a persisted NWC invoice as a fail-safe lock', () => {
    const snapshot = openGameSnapshot();
    snapshot.mockInvoices['contribution-1'] = {
      id: 'a'.repeat(64),
      request: 'lnbc1real',
      sats: 1000,
      status: 'PENDING',
      source: 'NWC',
    };

    expect(sessionRequiresNwcReceipts(snapshot)).toBe(true);
  });

  it('does not treat manual external-wallet receipts as NWC', () => {
    const snapshot = openGameSnapshot();
    snapshot.game!.lightningReceiveMode = 'EXTERNAL_WALLET_MANUAL';
    snapshot.mockInvoices['contribution-1'] = {
      id: 'manual-lightning:1',
      request: 'lno1qcp4256ypq',
      sats: 1000,
      status: 'PENDING',
      source: 'MANUAL_EXTERNAL',
    };
    expect(sessionRequiresNwcReceipts(snapshot)).toBe(false);
  });

  it('does not keep the lock after the game is closed', () => {
    const snapshot = openGameSnapshot();
    snapshot.game!.status = 'CLOSED';
    snapshot.game!.lightningReceiveMode = 'NWC_RECEIVE_ONLY';
    expect(sessionRequiresNwcReceipts(snapshot)).toBe(false);
  });

  it('recovers the lock from storage but never guesses from malformed data', () => {
    const storage = memoryStorage();
    const snapshot = openGameSnapshot();
    snapshot.game!.lightningReceiveMode = 'NWC_RECEIVE_ONLY';
    saveSession(storage, snapshot);
    expect(storageRequiresNwcReceipts(storage)).toBe(true);

    storage.setItem(SESSION_STORAGE_KEY, '{bad json');
    expect(storageRequiresNwcReceipts(storage)).toBe(false);
  });
});
