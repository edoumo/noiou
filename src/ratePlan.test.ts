/**
 * Rate-lock plan tests (NOIOU).
 *
 * The lock doctrine in one place: manual never needs network, automatic never
 * silently degrades, SATS has no oracle, an active game is immutable and a
 * legacy backup is restored (never refetched).
 */
import { describe, expect, it } from 'vitest';
import type { Game } from './domain';
import { providerRequiresNetwork, type LockedRate, type RateQuote } from './priceOracle';
import {
  applyLockedRateToGame,
  effectiveLockedRate,
  isManualLockedRate,
  normalizeImportedGame,
  pairForCreation,
  planRateLock,
  priceRateLockedPayload,
} from './ratePlan';

const NOW = Date.parse('2026-09-19T10:00:00Z');

function krakenQuote(overrides: Partial<RateQuote> = {}): RateQuote {
  return {
    provider: 'KRAKEN',
    pair: 'BTC/EUR',
    base: 'BTC',
    quote: 'EUR',
    bid: 70557.9,
    ask: 70558,
    rate: 70557.95,
    retrievedAt: '2026-09-19T09:59:30Z',
    ...overrides,
  };
}

function baseGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    currency: 'EUR',
    buyInAmount: 20,
    rebuyEnabled: true,
    rebuyAmount: 20,
    chipValue: 1,
    status: 'OPEN',
    dealer: { enabled: false, mode: 'NONE' },
    createdAt: '2026-09-19T10:00:00Z',
    ...overrides,
  };
}

/* ------------------------------------------------------------- SATS */

describe('SATS games', () => {
  it('carry no BTC/fiat oracle at all', () => {
    const plan = planRateLock({ currency: 'SATS', provider: 'KRAKEN', manualRate: null, manualNote: '', manualConfirmed: false, quote: null, nowMs: NOW });
    expect(plan.kind).toBe('NONE');
    expect(pairForCreation('SATS')).toBeUndefined();
  });

  it('never expose a locked rate even for a legacy flat value', () => {
    const game = baseGame({ currency: 'SATS', lockedBtcFiatRate: 100_000 });
    expect(effectiveLockedRate(game)).toBeUndefined();
  });
});

/* ---------------------------------------------------------- manual */

describe('manual rate plan', () => {
  it('locks a valid confirmed manual rate with no network dependency', () => {
    const plan = planRateLock({ currency: 'EUR', provider: 'MANUAL', manualRate: 97_000, manualNote: 'Accord des joueurs', manualConfirmed: true, quote: null, nowMs: NOW });
    expect(plan.kind).toBe('MANUAL');
    if (plan.kind !== 'MANUAL') throw new Error('unreachable');
    expect(plan.locked.manual).toBe(true);
    expect(plan.locked.rate).toBe(97_000);
    expect(plan.locked.manualNote).toBe('Accord des joueurs');
    expect(providerRequiresNetwork(plan.locked.provider)).toBe(false);
  });

  it('accepts a direct manual selection without any fetch attempt', () => {
    // No quote was ever fetched: MANUAL must still plan straight away.
    const plan = planRateLock({ currency: 'USD', provider: 'MANUAL', manualRate: 81_000, manualNote: '', manualConfirmed: true, quote: null, nowMs: NOW });
    expect(plan.kind).toBe('MANUAL');
  });

  it('blocks when the rate is missing', () => {
    const plan = planRateLock({ currency: 'EUR', provider: 'MANUAL', manualRate: null, manualNote: '', manualConfirmed: true, quote: null, nowMs: NOW });
    expect(plan).toEqual({ kind: 'BLOCKED', code: 'MANUAL_RATE_MISSING' });
  });

  it('blocks an invalid (zero/negative) rate', () => {
    expect(planRateLock({ currency: 'EUR', provider: 'MANUAL', manualRate: 0, manualNote: '', manualConfirmed: true, quote: null, nowMs: NOW })).toEqual({ kind: 'BLOCKED', code: 'MANUAL_RATE_INVALID' });
    expect(planRateLock({ currency: 'EUR', provider: 'MANUAL', manualRate: -5, manualNote: '', manualConfirmed: true, quote: null, nowMs: NOW })).toEqual({ kind: 'BLOCKED', code: 'MANUAL_RATE_INVALID' });
  });

  it('requires the explicit confirmation checkbox', () => {
    const plan = planRateLock({ currency: 'EUR', provider: 'MANUAL', manualRate: 97_000, manualNote: '', manualConfirmed: false, quote: null, nowMs: NOW });
    expect(plan).toEqual({ kind: 'BLOCKED', code: 'MANUAL_CONFIRM_REQUIRED' });
  });
});

/* ----------------------------------------------------------- automatic */

describe('automatic rate plan', () => {
  it('needs a quote when none was fetched', () => {
    const plan = planRateLock({ currency: 'EUR', provider: 'KRAKEN', manualRate: null, manualNote: '', manualConfirmed: false, quote: null, nowMs: NOW });
    expect(plan).toEqual({ kind: 'NEEDS_QUOTE' });
  });

  it('locks a fresh Kraken quote with its full metadata', () => {
    const plan = planRateLock({ currency: 'EUR', provider: 'KRAKEN', manualRate: null, manualNote: '', manualConfirmed: false, quote: krakenQuote(), nowMs: NOW });
    expect(plan.kind).toBe('AUTO');
    if (plan.kind !== 'AUTO') throw new Error('unreachable');
    expect(plan.locked.provider).toBe('KRAKEN');
    expect(plan.locked.bid).toBe(70557.9);
    expect(plan.locked.ask).toBe(70558);
    expect(plan.locked.rate).toBeCloseTo(70557.95, 6);
    expect(plan.locked.retrievedAt).toBe('2026-09-19T09:59:30Z');
    expect(plan.locked.lockedAt).toBe('2026-09-19T10:00:00.000Z');
    expect(plan.locked.manual).toBeUndefined();
  });

  it('blocks a stale quote instead of locking it', () => {
    const plan = planRateLock({ currency: 'EUR', provider: 'KRAKEN', manualRate: null, manualNote: '', manualConfirmed: false, quote: krakenQuote({ retrievedAt: '2026-09-19T09:50:00Z' }), nowMs: NOW });
    expect(plan).toEqual({ kind: 'BLOCKED', code: 'QUOTE_STALE' });
  });

  it('never reuses another provider quote for the current provider', () => {
    const plan = planRateLock({ currency: 'EUR', provider: 'COINBASE', manualRate: null, manualNote: '', manualConfirmed: false, quote: krakenQuote(), nowMs: NOW });
    expect(plan).toEqual({ kind: 'NEEDS_QUOTE' });
  });

  it('never reuses a quote from the other currency', () => {
    const plan = planRateLock({ currency: 'USD', provider: 'KRAKEN', manualRate: null, manualNote: '', manualConfirmed: false, quote: krakenQuote(), nowMs: NOW });
    expect(plan).toEqual({ kind: 'NEEDS_QUOTE' });
  });
});

/* ------------------------------------------------------------ the lock */

describe('game lock', () => {
  it('writes the rate and the metadata in one place', () => {
    const plan = planRateLock({ currency: 'EUR', provider: 'KRAKEN', manualRate: null, manualNote: '', manualConfirmed: false, quote: krakenQuote(), nowMs: NOW });
    if (plan.kind !== 'AUTO') throw new Error('unreachable');
    const game = applyLockedRateToGame(baseGame(), plan.locked);
    expect(game.lockedBtcFiatRate).toBe(70557.95);
    expect(game.lockedRate?.provider).toBe('KRAKEN');
  });

  it('clears both fields for a SATS game', () => {
    const game = applyLockedRateToGame(baseGame({ lockedBtcFiatRate: 100_000 }), undefined);
    expect(game.lockedBtcFiatRate).toBeUndefined();
    expect(game.lockedRate).toBeUndefined();
  });

  it('is immune to a settings change: nothing but the lock writer sets the rate', () => {
    const plan = planRateLock({ currency: 'EUR', provider: 'MANUAL', manualRate: 90_000, manualNote: '', manualConfirmed: true, quote: null, nowMs: NOW });
    if (plan.kind !== 'MANUAL') throw new Error('unreachable');
    const created = applyLockedRateToGame(baseGame(), plan.locked);
    // Simulate a later preference change (Kraken) and a re-render: the game
    // object is what it is — the displayed effective rate stays the locked one.
    const afterSettingsChange = { ...created };
    expect(effectiveLockedRate(afterSettingsChange)?.rate).toBe(90_000);
    expect(effectiveLockedRate(afterSettingsChange)?.provider).toBe('MANUAL');
    expect(isManualLockedRate(effectiveLockedRate(afterSettingsChange))).toBe(true);
  });
});

/* ---------------------------------------------------- legacy backups */

describe('legacy backup compatibility', () => {
  it('surfaces a legacy flat rate as a documented manual value', () => {
    const game = baseGame({ lockedBtcFiatRate: 100_000, lockedRate: undefined });
    const locked = effectiveLockedRate(game);
    expect(locked?.provider).toBe('MANUAL');
    expect(locked?.manual).toBe(true);
    expect(locked?.legacy).toBe(true);
    expect(locked?.rate).toBe(100_000);
  });

  it('normalizes an imported legacy game without ever refetching', () => {
    const imported = normalizeImportedGame(baseGame({ lockedBtcFiatRate: 80_000 }));
    expect(imported?.lockedRate?.rate).toBe(80_000);
    expect(imported?.lockedRate?.legacy).toBe(true);
    expect(imported?.lockedBtcFiatRate).toBe(80_000);
  });

  it('leaves a modern game untouched on import', () => {
    const modern = baseGame({ lockedRate: { provider: 'KRAKEN', pair: 'BTC/EUR', base: 'BTC', quote: 'EUR', bid: 1, ask: 2, rate: 1.5, retrievedAt: '2026-09-19T09:59:30Z', lockedAt: '2026-09-19T10:00:00Z' }, lockedBtcFiatRate: 1.5 });
    expect(normalizeImportedGame(modern)).toBe(modern);
  });
});

/* ------------------------------------------------------ ledger payload */

describe('PRICE_RATE_LOCKED payload', () => {
  it('makes an automatic rate auditable', () => {
    const locked: LockedRate = { provider: 'KRAKEN', pair: 'BTC/EUR', base: 'BTC', quote: 'EUR', bid: 70557.9, ask: 70558, rate: 70557.95, retrievedAt: '2026-09-19T09:59:30Z', lockedAt: '2026-09-19T10:00:00Z' };
    const payload = priceRateLockedPayload(locked);
    expect(payload).toMatchObject({
      provider: 'KRAKEN',
      pair: 'BTC/EUR',
      bid: 70557.9,
      ask: 70558,
      rate: 70557.95,
      retrievedAt: '2026-09-19T09:59:30Z',
      lockedAt: '2026-09-19T10:00:00Z',
      manual: false,
      verifiedByMarket: true,
    });
  });

  it('makes a manual rate immediately identifiable in the journal', () => {
    const locked: LockedRate = { provider: 'MANUAL', pair: 'BTC/EUR', base: 'BTC', quote: 'EUR', rate: 97_000, lockedAt: '2026-09-19T10:00:00Z', manual: true, manualNote: 'Cours constaté avant perte de réseau' };
    const payload = priceRateLockedPayload(locked);
    expect(payload.provider).toBe('MANUAL');
    expect(payload.manual).toBe(true);
    expect(payload.rate).toBe(97_000);
    expect(payload.note).toBe('Cours constaté avant perte de réseau');
    expect(payload.verifiedByMarket).toBe(false);
  });
});
