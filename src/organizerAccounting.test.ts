import { describe, expect, it } from 'vitest';
import type { Game, Payout, Player } from './domain';
import { allocateOrganizerWalletContribution, retainOrganizerPayout } from './organizerAccounting';

const game: Game = {
  id: 'g', currency: 'SATS', buyInAmount: 100, rebuyEnabled: true, rebuyAmount: 100,
  chipsPerBuyIn: 10, chipValue: 10, status: 'OPEN', dealer: { enabled: false, mode: 'NONE' },
  createdAt: '2026-09-15T20:00:00Z', lobbyVersion: 1,
};

const organizer: Player = { id: 'o', nickname: 'Ed', preferredPayment: 'LIGHTNING', isOrganizer: true };

describe('organizer-player accounting', () => {
  it('marks an organizer cave paid without creating a self-transfer', () => {
    const result = allocateOrganizerWalletContribution(game, organizer, 'BUYIN', [], 'c1', '2026-09-15T20:01:00Z');
    expect(result.reference).toBe('organizer-allocation:c1');
    expect(result.contribution.status).toBe('PAID');
    expect(result.contribution.method).toBe('LIGHTNING');
    expect(result.contribution.externalReference).toBe('organizer-allocation:c1');
  });

  it('keeps organizer payout in the wallet without an invoice', () => {
    const payouts: Payout[] = [{ playerId: 'o', amount: 150, method: 'ANY', status: 'PENDING' }];
    const result = retainOrganizerPayout(payouts, organizer);
    expect(result[0]).toMatchObject({
      method: 'LIGHTNING',
      status: 'CONFIRMED',
      execution: 'ORGANIZER_WALLET_RETENTION',
    });
    expect(result[0].lightningRequest).toBeUndefined();
  });

  it('rejects allocation for a non-organizer', () => {
    expect(() => allocateOrganizerWalletContribution(game, { ...organizer, isOrganizer: false }, 'BUYIN', [], 'c1')).toThrow(/organisateur/);
  });
});
