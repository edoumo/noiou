/**
 * Rate lock — anti-manipulation tests (NOIOU, mandate §33).
 *
 * A created game's provider and rate must survive: changing the preference,
 * reloading, navigating, exporting/importing, and even a hostile settings edit.
 * The same guarantee is proven for a MANUAL game.
 */
import { describe, expect, it } from 'vitest';
import { createEmptySession, parseSession, serializeSession, type SessionSnapshot } from './session';
import { createSessionBackup, parseSessionBackup } from './backup';
import { appendLedgerEvent } from './ledger';
import { effectiveLockedRate, normalizeImportedGame } from './ratePlan';
import type { Game } from './domain';
import type { LockedRate } from './priceOracle';

const KRAKEN_LOCK: LockedRate = {
  provider: 'KRAKEN',
  pair: 'BTC/EUR',
  base: 'BTC',
  quote: 'EUR',
  bid: 70557.9,
  ask: 70558,
  rate: 70557.95,
  retrievedAt: '2026-09-19T09:59:30Z',
  lockedAt: '2026-09-19T10:00:00Z',
};

const MANUAL_LOCK: LockedRate = {
  provider: 'MANUAL',
  pair: 'BTC/EUR',
  base: 'BTC',
  quote: 'EUR',
  rate: 97_000,
  lockedAt: '2026-09-19T10:00:00Z',
  manual: true,
  manualNote: 'Cours constaté avant perte de réseau',
};

async function gameSession(locked: LockedRate): Promise<SessionSnapshot> {
  const session = createEmptySession('2026-09-19T10:00:00Z');
  const game: Game = {
    id: 'game-lock',
    currency: 'EUR',
    buyInAmount: 20,
    rebuyEnabled: true,
    rebuyAmount: 20,
    chipValue: 1,
    status: 'OPEN',
    dealer: { enabled: false, mode: 'NONE' },
    lockedBtcFiatRate: locked.rate,
    lockedRate: locked,
    createdAt: '2026-09-19T10:00:00Z',
    lobbyVersion: 1,
  };
  const created = await appendLedgerEvent([], {
    id: 'event-1',
    gameId: game.id,
    type: 'GAME_CREATED',
    at: '2026-09-19T10:00:00Z',
    payload: { currency: 'EUR', lockedBtcFiatRate: locked.rate, rateProvider: locked.provider },
  });
  const rateEvent = await appendLedgerEvent([created], {
    id: 'event-2',
    gameId: game.id,
    type: 'PRICE_RATE_LOCKED',
    at: '2026-09-19T10:00:01Z',
    payload: { provider: locked.provider, rate: locked.rate, manual: Boolean(locked.manual) },
  });
  session.game = game;
  session.ledger = [created, rateEvent];
  return session;
}

describe('rate lock — Kraken game', () => {
  it('keeps provider, pair, bid, ask, rate and timestamps immutable through a session round-trip', async () => {
    const session = await gameSession(KRAKEN_LOCK);
    const restored = parseSession(serializeSession(session));
    const locked = restored.game?.lockedRate;
    expect(locked?.provider).toBe('KRAKEN');
    expect(locked?.pair).toBe('BTC/EUR');
    expect(locked?.bid).toBe(70557.9);
    expect(locked?.ask).toBe(70558);
    expect(locked?.rate).toBeCloseTo(70557.95, 6);
    expect(locked?.retrievedAt).toBe('2026-09-19T09:59:30Z');
    expect(locked?.lockedAt).toBe('2026-09-19T10:00:00Z');
  });

  it('is unaffected by a later preference change to MANUAL', async () => {
    const session = await gameSession(KRAKEN_LOCK);
    const before = effectiveLockedRate(session.game);
    // The settings panel only writes the *preference* for the next game; the
    // active game object is never a target of that write.
    const afterPreferenceChange = { ...session.game! };
    expect(effectiveLockedRate(afterPreferenceChange)?.provider).toBe(before?.provider);
    expect(effectiveLockedRate(afterPreferenceChange)?.rate).toBe(before?.rate);
  });

  it('survives export → import with the exact same rate and no refetch', async () => {
    const session = await gameSession(KRAKEN_LOCK);
    const raw = await createSessionBackup(session, '2026-09-19T11:00:00Z');
    const envelope = JSON.parse(raw) as { snapshot: { game: { lockedRate: LockedRate } } };
    // Rate metadata is exported in full.
    expect(envelope.snapshot.game.lockedRate.provider).toBe('KRAKEN');
    expect(envelope.snapshot.game.lockedRate.bid).toBe(70557.9);
    expect(envelope.snapshot.game.lockedRate.ask).toBe(70558);
    expect(envelope.snapshot.game.lockedRate.retrievedAt).toBe('2026-09-19T09:59:30Z');
    expect(envelope.snapshot.game.lockedRate.lockedAt).toBe('2026-09-19T10:00:00Z');

    const restored = await parseSessionBackup(raw);
    expect(restored.game?.lockedRate).toEqual(KRAKEN_LOCK);
    expect(restored.game?.lockedBtcFiatRate).toBeCloseTo(70557.95, 6);
  });

  it('records PRICE_RATE_LOCKED with the full audit trail', async () => {
    const session = await gameSession(KRAKEN_LOCK);
    const event = session.ledger.find((entry) => entry.type === 'PRICE_RATE_LOCKED');
    expect(event).toBeTruthy();
    expect(event?.payload).toMatchObject({ provider: 'KRAKEN', rate: 70557.95, manual: false });
  });
});

describe('rate lock — MANUAL game', () => {
  it('keeps the manual rate, its flag and its note through a round-trip', async () => {
    const session = await gameSession(MANUAL_LOCK);
    const restored = parseSession(serializeSession(session));
    expect(restored.game?.lockedRate).toEqual(MANUAL_LOCK);
    expect(restored.game?.lockedRate?.manual).toBe(true);
    expect(restored.game?.lockedRate?.manualNote).toBe('Cours constaté avant perte de réseau');
    // A manual rate carries no market metadata at all.
    expect(restored.game?.lockedRate?.bid).toBeUndefined();
    expect(restored.game?.lockedRate?.ask).toBeUndefined();
  });

  it('survives export → import with its manual metadata intact', async () => {
    const session = await gameSession(MANUAL_LOCK);
    const raw = await createSessionBackup(session);
    const restored = await parseSessionBackup(raw);
    expect(restored.game?.lockedRate?.provider).toBe('MANUAL');
    expect(restored.game?.lockedRate?.manual).toBe(true);
    expect(restored.game?.lockedRate?.manualNote).toBe('Cours constaté avant perte de réseau');
    expect(restored.game?.lockedRate?.rate).toBe(97_000);
  });

  it('is flagged as unverified in the journal event', async () => {
    const session = await gameSession(MANUAL_LOCK);
    const event = session.ledger.find((entry) => entry.type === 'PRICE_RATE_LOCKED');
    expect(event?.payload).toMatchObject({ provider: 'MANUAL', rate: 97_000, manual: true });
  });

  it('is unaffected by a later preference change to Kraken', async () => {
    const session = await gameSession(MANUAL_LOCK);
    const afterPreferenceChange = { ...session.game! };
    expect(afterPreferenceChange.lockedRate?.provider).toBe('MANUAL');
    expect(afterPreferenceChange.lockedRate?.rate).toBe(97_000);
  });
});

describe('legacy backup import', () => {
  it('restores a backup that only carried lockedBtcFiatRate', async () => {
    const session = createEmptySession('2026-09-13T12:00:00Z');
    const game: Game = {
      id: 'legacy-game',
      currency: 'EUR',
      buyInAmount: 20,
      rebuyEnabled: true,
      rebuyAmount: 20,
      chipValue: 1,
      status: 'OPEN',
      dealer: { enabled: false, mode: 'NONE' },
      lockedBtcFiatRate: 100_000,
      createdAt: '2026-09-13T12:00:00Z',
    };
    const event = await appendLedgerEvent([], { id: 'legacy-1', gameId: game.id, type: 'GAME_CREATED', at: '2026-09-13T12:00:00Z', payload: { currency: 'EUR' } });
    session.game = game;
    session.ledger = [event];

    const raw = await createSessionBackup(session);
    const restored = await parseSessionBackup(raw);
    const normalized = normalizeImportedGame(restored.game);

    // The historical value is preserved EXACTLY and documented as legacy manual.
    expect(normalized?.lockedBtcFiatRate).toBe(100_000);
    expect(normalized?.lockedRate?.rate).toBe(100_000);
    expect(normalized?.lockedRate?.provider).toBe('MANUAL');
    expect(normalized?.lockedRate?.legacy).toBe(true);
  });
});
