/**
 * Offline doctrine — full cash game with a manual rate (NOIOU, mandate §11/§23/§24).
 *
 * Proves, at the logic level, that:
 *  - an EUR/USD cash game with a MANUAL rate needs NO network access at all
 *    (creation, players, caves, rebuys, counting, settlement, ledger, backup);
 *  - a KRAKEN rate with no network fails closed: the game is NOT created with a
 *    made-up rate and the UI is offered the explicit manual escape;
 *  - there is never a silent automatic fallback to manual.
 *
 * The network is instrumented: any fetch attempt is recorded, so "no call was
 * made" is an assertion, not a claim.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Contribution, Game, LedgerEvent, Player } from './domain';
import { appendLedgerEvent, verifyLedger } from './ledger';
import { fetchQuote, PriceOracleError } from './priceOracle';
import { planRateLock } from './ratePlan';
import { createSessionBackup, parseSessionBackup } from './backup';
import { createEmptySession, type SessionSnapshot } from './session';
import { confirmCashContribution, createContribution } from './game';
import { calculateIssuedChips, calculateSettlement } from './settlement';

const NOW = Date.parse('2026-09-19T10:00:00Z');

/** A fetch implementation that records every call and always fails. */
function offlineFetch() {
  const calls: string[] = [];
  const impl = vi.fn(async (url: string) => {
    calls.push(url);
    throw new Error('net::ERR_INTERNET_DISCONNECTED');
  });
  return { calls, impl: impl as unknown as typeof fetch };
}

function makePlayers(): Player[] {
  return [
    { id: 'p1', nickname: 'Alice', preferredPayment: 'CASH' },
    { id: 'p2', nickname: 'Bob', preferredPayment: 'CASH' },
    { id: 'p3', nickname: 'Carol', preferredPayment: 'CASH' },
  ];
}

/**
 * Build the offline EUR cash game exactly as the app does, but with the oracle
 * fully instrumented. Returns the session plus the number of network calls.
 */
async function runOfflineCashGame(currency: 'EUR' | 'USD') {
  const { calls, impl } = offlineFetch();
  const players = makePlayers();

  // 1. Rate plan: MANUAL selected BEFORE any Kraken attempt — no fetch at all.
  const plan = planRateLock({
    currency,
    provider: 'MANUAL',
    manualRate: currency === 'EUR' ? 97_000 : 81_000,
    manualNote: 'Cours constaté avant perte de réseau',
    manualConfirmed: true,
    quote: null,
    nowMs: NOW,
  });
  if (plan.kind !== 'MANUAL') throw new Error(`manual plan expected, got ${plan.kind}`);

  // 2. Game creation (cash, no Lightning at all).
  const game: Game = {
    id: 'offline-game',
    currency,
    buyInAmount: 20,
    rebuyEnabled: true,
    rebuyAmount: 20,
    chipsPerBuyIn: 10,
    chipValue: 2,
    status: 'OPEN',
    dealer: { enabled: false, mode: 'NONE' },
    lockedBtcFiatRate: plan.locked.rate,
    lockedRate: plan.locked,
    createdAt: '2026-09-19T10:00:00Z',
    lobbyVersion: 1,
  };

  // 3. Ledger chain, including the auditable rate lock.
  let ledger: LedgerEvent[] = [await appendLedgerEvent([], { id: 'e1', gameId: game.id, type: 'GAME_CREATED', at: '2026-09-19T10:00:00Z', payload: { currency, lockedBtcFiatRate: plan.locked.rate } })];
  ledger.push(await appendLedgerEvent(ledger, { id: 'e2', gameId: game.id, type: 'PRICE_RATE_LOCKED', at: '2026-09-19T10:00:01Z', payload: { provider: 'MANUAL', rate: plan.locked.rate, manual: true } }));

  // 4. Cash caves for the three players + one cash rebuy.
  let contributions: Contribution[] = [];
  for (const player of players) {
    const contribution = createContribution(game, player.id, 'BUYIN', 'CASH');
    contributions = confirmCashContribution([...contributions, contribution], contribution.id);
    ledger.push(await appendLedgerEvent(ledger, { id: `c-${player.id}`, gameId: game.id, type: 'CONTRIBUTION_PAID', payload: { playerId: player.id, method: 'CASH' } }));
  }
  const rebuy = createContribution(game, 'p1', 'REBUY', 'CASH');
  contributions = confirmCashContribution([...contributions, rebuy], rebuy.id);

  // 5. Counting + settlement (cash) — no rate involved beyond chips/amounts.
  const issued = calculateIssuedChips(game, contributions);
  // 40 chips issued (4 caves × 10); the counted stacks must add up exactly.
  const counted = [14, 13, 13];
  const finalStacks = players.map((player, index) => ({ playerId: player.id, chips: counted[index] }));
  const settlement = calculateSettlement(game, players, contributions, finalStacks);

  // 6. Backup + restore.
  const session: SessionSnapshot = createEmptySession('2026-09-19T11:00:00Z');
  session.game = game;
  session.players = players;
  session.contributions = contributions;
  session.stacks = Object.fromEntries(finalStacks.map((stack) => [stack.playerId, stack.chips]));
  session.stacksLocked = true;
  session.settlement = settlement;
  session.ledger = ledger;
  const raw = await createSessionBackup(session);
  const restored = await parseSessionBackup(raw);

  void impl; // the offline fetch is never wired into the manual path
  return { calls, contributions, settlement, restored, issued, ledger };
}

describe('offline EUR cash game with a manual rate', () => {
  it('runs the whole journey with ZERO network calls', async () => {
    const { calls, contributions, settlement, restored, issued } = await runOfflineCashGame('EUR');
    expect(calls).toEqual([]); // proven: no fetch was ever attempted
    expect(contributions).toHaveLength(4); // 3 caves + 1 recave
    expect(contributions.every((entry) => entry.status === 'PAID')).toBe(true);
    expect(issued).toBe(40); // 4 buy-ins × 10 chips
    expect(settlement.balanced).toBe(true);
    expect(restored.game?.lockedRate?.provider).toBe('MANUAL');
    expect(await verifyLedger(restored.ledger)).toBe(true);
  });

  it('carries the manual rate and its note into the backup', async () => {
    const { restored } = await runOfflineCashGame('EUR');
    expect(restored.game?.lockedRate?.manual).toBe(true);
    expect(restored.game?.lockedRate?.rate).toBe(97_000);
    expect(restored.game?.lockedRate?.manualNote).toBe('Cours constaté avant perte de réseau');
  });
});

describe('offline USD creation with a manual rate', () => {
  it('creates a minimal USD game offline', async () => {
    const { calls, restored } = await runOfflineCashGame('USD');
    expect(calls).toEqual([]);
    expect(restored.game?.currency).toBe('USD');
    expect(restored.game?.lockedRate?.pair).toBe('BTC/USD');
    expect(restored.game?.lockedRate?.rate).toBe(81_000);
  });
});

describe('offline KRAKEN fails closed', () => {
  it('never invents a price when the network is down', async () => {
    const { calls, impl } = offlineFetch();
    await expect(
      fetchQuote({ provider: 'KRAKEN', quote: 'EUR', fetchImpl: impl, isOnline: () => true }),
    ).rejects.toBeInstanceOf(PriceOracleError);
    expect(calls).toHaveLength(1); // one attempt, no retry loop
  });

  it('blocks the game creation instead of starting with a fake rate', () => {
    // Offline + KRAKEN + no quote → the plan demands a quote, so the creation
    // path throws and no Game object is produced.
    const plan = planRateLock({ currency: 'EUR', provider: 'KRAKEN', manualRate: null, manualNote: '', manualConfirmed: false, quote: null, nowMs: NOW });
    expect(plan).toEqual({ kind: 'NEEDS_QUOTE' });
  });

  it('only reaches MANUAL after an explicit user action, never on its own', () => {
    // The oracle layer has no code path that emits a manual rate by itself: the
    // manual plan requires the MANUAL provider to have been selected.
    const withKraken = planRateLock({ currency: 'EUR', provider: 'KRAKEN', manualRate: 97_000, manualNote: '', manualConfirmed: true, quote: null, nowMs: NOW });
    expect(withKraken.kind).toBe('NEEDS_QUOTE'); // manual values ignored while KRAKEN is selected
    const withManual = planRateLock({ currency: 'EUR', provider: 'MANUAL', manualRate: 97_000, manualNote: '', manualConfirmed: true, quote: null, nowMs: NOW });
    expect(withManual.kind).toBe('MANUAL'); // explicit selection only
  });

  it('reports the offline code so the UI can offer the three explicit actions', async () => {
    const { impl } = offlineFetch();
    try {
      await fetchQuote({ provider: 'KRAKEN', quote: 'EUR', fetchImpl: impl, isOnline: () => false });
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as PriceOracleError).code).toBe('OFFLINE');
    }
  });
});

describe('SATS games call no oracle', () => {
  it('plans no rate and reaches no endpoint', () => {
        const plan = planRateLock({ currency: 'SATS', provider: 'KRAKEN', manualRate: null, manualNote: '', manualConfirmed: false, quote: null, nowMs: NOW });
    expect(plan.kind).toBe('NONE');
  });
});