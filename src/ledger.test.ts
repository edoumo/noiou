import { describe, expect, it } from 'vitest';
import type { LedgerEvent } from './domain';
import { appendLedgerEvent, GENESIS_HASH, verifyLedger } from './ledger';

describe('ledger', () => {
  it('creates a deterministic hash chain with monotonic sequence', async () => {
    const first = await appendLedgerEvent([], {
      id: 'e1',
      gameId: 'g1',
      type: 'GAME_CREATED',
      at: '2026-09-13T12:00:00Z',
      payload: { currency: 'EUR', buyIn: 20 },
    });
    const second = await appendLedgerEvent([first], {
      id: 'e2',
      gameId: 'g1',
      type: 'PLAYER_JOINED',
      at: '2026-09-13T12:01:00Z',
      payload: { playerId: 'p1', nickname: 'Alice' },
    });

    expect(first.sequence).toBe(1);
    expect(first.previousHash).toBe(GENESIS_HASH);
    expect(second.sequence).toBe(2);
    expect(second.previousHash).toBe(first.hash);
    expect(await verifyLedger([first, second])).toBe(true);
  });

  it('detects event payload tampering', async () => {
    const event = await appendLedgerEvent([], {
      id: 'e1', gameId: 'g1', type: 'CASH_CONFIRMED', at: '2026-09-13T12:00:00Z', payload: { amount: 20 },
    });
    const tampered: LedgerEvent = { ...event, payload: { amount: 200 } };
    expect(await verifyLedger([tampered])).toBe(false);
  });

  it('detects event deletion/reordering through sequence and previous hash', async () => {
    const first = await appendLedgerEvent([], { id: 'e1', gameId: 'g1', type: 'GAME_CREATED', at: '2026-09-13T12:00:00Z' });
    const second = await appendLedgerEvent([first], { id: 'e2', gameId: 'g1', type: 'PLAYER_JOINED', at: '2026-09-13T12:01:00Z' });
    expect(await verifyLedger([second])).toBe(false);
    expect(await verifyLedger([second, first])).toBe(false);
  });
});
