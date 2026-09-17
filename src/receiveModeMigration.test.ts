import { describe, expect, it } from 'vitest';
import type { Contribution, Game } from './domain';
import { createEmptySession, type SessionSnapshot } from './session';
import { planMockRetirement } from './receiveModeMigration';

function openGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    currency: 'SATS',
    buyInAmount: 100,
    rebuyEnabled: true,
    rebuyAmount: 100,
    chipsPerBuyIn: 10,
    chipValue: 10,
    status: 'OPEN',
    dealer: { enabled: false, mode: 'NONE' },
    lightningReceiveMode: 'MOCK',
    createdAt: '2026-09-17T12:00:00Z',
    lobbyVersion: 1,
    ...overrides,
  };
}

function contribution(overrides: Partial<Contribution> = {}): Contribution {
  return {
    id: 'c1',
    gameId: 'game-1',
    playerId: 'p1',
    kind: 'BUYIN',
    method: 'LIGHTNING',
    amount: 100,
    status: 'PAID',
    createdAt: '2026-09-17T12:00:00Z',
    ...overrides,
  };
}

function snapshotWith(game: Game | null, contributions: Contribution[], invoices: SessionSnapshot['mockInvoices'] = {}): SessionSnapshot {
  const snapshot = createEmptySession('2026-09-17T12:00:00Z');
  snapshot.game = game;
  snapshot.contributions = contributions;
  snapshot.mockInvoices = invoices;
  return snapshot;
}

const mockInvoice = { id: 'inv-1', request: 'lnmock:inv-1:100:x', sats: 100, status: 'PENDING' as const, source: 'MOCK' as const };

describe('mock retirement migration (production)', () => {
  it('switches an active mock game to the external/manual flow', () => {
    const snapshot = snapshotWith(openGame(), []);
    const plan = planMockRetirement(snapshot, { allowMockPayments: false, nwcLocked: false });
    expect(plan.migrated).toBe(true);
    expect(plan.game?.lightningReceiveMode).toBe('EXTERNAL_WALLET_MANUAL');
  });

  it('treats a legacy game without an explicit receive mode as mock', () => {
    const game = openGame();
    delete game.lightningReceiveMode;
    const plan = planMockRetirement(snapshotWith(game, []), { allowMockPayments: false, nwcLocked: false });
    expect(plan.migrated).toBe(true);
    expect(plan.game?.lightningReceiveMode).toBe('EXTERNAL_WALLET_MANUAL');
  });

  it('cancels pending and confirmed fictional receipts so they can never count as real money', () => {
    const pending = contribution({ id: 'c-open', status: 'PENDING', externalReference: 'inv-open' });
    const paid = contribution({ id: 'c-paid', status: 'PAID', externalReference: 'inv-paid' });
    const contributions = [pending, paid];
    const invoices = {
      'c-open': { ...mockInvoice, id: 'inv-open', status: 'PENDING' as const },
      'c-paid': { ...mockInvoice, id: 'inv-paid', status: 'PAID' as const },
    };
    const plan = planMockRetirement(snapshotWith(openGame(), contributions, invoices), { allowMockPayments: false, nwcLocked: false });
    expect(plan.cancelledOpenContributionIds).toEqual(['c-open']);
    expect(plan.cancelledPaidContributionIds).toEqual(['c-paid']);
    expect(plan.contributions.every((item) => item.status === 'CANCELLED')).toBe(true);
  });

  it('never touches cash contributions, organizer allocations or real NWC invoices', () => {
    const cash = contribution({ id: 'c-cash', method: 'CASH', status: 'PAID' });
    const organizer = contribution({ id: 'c-org', status: 'PAID', externalReference: 'organizer-allocation:c-org' });
    const nwc = contribution({ id: 'c-nwc', status: 'PENDING', externalReference: 'inv-nwc' });
    const contributions = [cash, organizer, nwc];
    const invoices = { 'c-org': { ...mockInvoice, id: 'organizer-allocation:c-org' }, 'c-nwc': { id: 'inv-nwc', request: 'lnbc1real', sats: 100, status: 'PENDING' as const, source: 'NWC' as const } };
    const plan = planMockRetirement(snapshotWith(openGame(), contributions, invoices), { allowMockPayments: false, nwcLocked: false });
    expect(plan.contributions.map((item) => item.status)).toEqual(['PAID', 'PAID', 'PENDING']);
    expect(plan.cancelledOpenContributionIds).toEqual([]);
    expect(plan.cancelledPaidContributionIds).toEqual([]);
  });

  it('does nothing for dev/test builds', () => {
    const plan = planMockRetirement(snapshotWith(openGame(), []), { allowMockPayments: true, nwcLocked: false });
    expect(plan.migrated).toBe(false);
    expect(plan.game?.lightningReceiveMode).toBe('MOCK');
  });

  it('does nothing for games locked to real NWC receipts', () => {
    const plan = planMockRetirement(snapshotWith(openGame({ lightningReceiveMode: 'NWC_RECEIVE_ONLY' }), []), { allowMockPayments: false, nwcLocked: true });
    expect(plan.migrated).toBe(false);
  });

  it('does nothing for games already on a real receive mode', () => {
    const plan = planMockRetirement(snapshotWith(openGame({ lightningReceiveMode: 'EXTERNAL_WALLET_MANUAL' }), []), { allowMockPayments: false, nwcLocked: false });
    expect(plan.migrated).toBe(false);
  });

  it('leaves closed games untouched', () => {
    const plan = planMockRetirement(snapshotWith(openGame({ status: 'CLOSED' }), [contribution()]), { allowMockPayments: false, nwcLocked: false });
    expect(plan.migrated).toBe(false);
  });

  it('keeps historical records on a settling game but stops new fictional receipts', () => {
    const plan = planMockRetirement(snapshotWith(openGame({ status: 'SETTLING' }), [contribution()], { c1: mockInvoice }), { allowMockPayments: false, nwcLocked: false });
    expect(plan.migrated).toBe(true);
    expect(plan.game?.lightningReceiveMode).toBe('EXTERNAL_WALLET_MANUAL');
    expect(plan.historicalMockReceiptsRemain).toBe(true);
    expect(plan.contributions[0].status).toBe('PAID');
  });

  it('handles an empty session without crashing', () => {
    const plan = planMockRetirement(null, { allowMockPayments: false, nwcLocked: false });
    expect(plan.migrated).toBe(false);
    expect(plan.game).toBeNull();
  });
});
