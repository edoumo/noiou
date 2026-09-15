import { describe, expect, it } from 'vitest';
import {
  buildPartyInviteUrl,
  createPartyInvite,
  createPartyJoinResponse,
  encodePartyJoinResponse,
  parsePartyInvite,
  parsePartyJoinResponse,
} from './partyJoin';

describe('party join QR handshake', () => {
  it('round-trips an organizer invite URL without secrets and exposes game terms', () => {
    const invite = createPartyInvite('game-123', 'SATS', 1000, '2026-09-14T20:00:00Z', 10);
    const url = buildPartyInviteUrl('https://alpha.noiou.io/', invite);
    expect(url).toContain('https://alpha.noiou.io/');
    expect(url).not.toContain('1000');
    expect(parsePartyInvite(url)).toEqual(invite);
    expect(parsePartyInvite(url).chipsPerBuyIn).toBe(10);
  });

  it('keeps older invite payloads without chip terms readable', () => {
    const invite = createPartyInvite('game-legacy', 'EUR', 10, '2026-09-14T20:00:00Z');
    expect(invite.chipsPerBuyIn).toBeUndefined();
    expect(parsePartyInvite(buildPartyInviteUrl('https://alpha.noiou.io/', invite))).toEqual(invite);
  });

  it('rejects invalid chip terms', () => {
    expect(() => createPartyInvite('game-123', 'SATS', 1000, '2026-09-14T20:00:00Z', 0)).toThrow(/jetons/);
    expect(() => createPartyInvite('game-123', 'SATS', 1000, '2026-09-14T20:00:00Z', 10.5)).toThrow(/jetons/);
  });

  it('round-trips a participant response', () => {
    const response = createPartyJoinResponse({
      gameId: 'game-123',
      nickname: 'Alice',
      preferredPayment: 'LIGHTNING',
      lightningDestination: 'alice@example.com',
    });
    expect(parsePartyJoinResponse(encodePartyJoinResponse(response))).toEqual(response);
  });

  it('allows Lightning preference without a persistent destination', () => {
    const response = createPartyJoinResponse({ gameId: 'game-123', nickname: 'Bob', preferredPayment: 'LIGHTNING' });
    expect(response.lightningDestination).toBeUndefined();
  });

  it('rejects BOLT11 as a persistent join destination', () => {
    expect(() => createPartyJoinResponse({
      gameId: 'game-123',
      nickname: 'Alice',
      preferredPayment: 'LIGHTNING',
      lightningDestination: 'lnbc10u1pexample',
    })).toThrow(/ponctuelle/);
  });

  it('rejects malformed and wrong-type payloads', () => {
    expect(() => parsePartyInvite('not-an-invite')).toThrow(/invalide/);
    expect(() => parsePartyJoinResponse('not-a-response')).toThrow(/invalide/);
  });
});
