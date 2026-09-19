import type { Currency, PaymentMethod } from './domain';
import { normalizeReusableLightningDestination } from './lightningDestination';
import { isSupportedCurrency } from './currency';
import { t } from './i18n';

export const PARTY_JOIN_VERSION = 1 as const;
export const PARTY_JOIN_RESPONSE_PREFIX = 'noiou:join-response:';

export interface PartyInvite {
  v: typeof PARTY_JOIN_VERSION;
  type: 'PARTY_INVITE';
  gameId: string;
  currency: Currency;
  buyInAmount: number;
  /** Optional keeps QR invites created before UX19 readable. */
  chipsPerBuyIn?: number;
  createdAt: string;
}

export interface PartyJoinResponse {
  v: typeof PARTY_JOIN_VERSION;
  type: 'PARTY_JOIN_RESPONSE';
  gameId: string;
  nickname: string;
  preferredPayment: PaymentMethod | 'ANY';
  lightningDestination?: string;
}

function encodeBase64Url(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url<T>(value: string): T {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

function decodeOrThrow<T>(value: string, message: string): T {
  try {
    return decodeBase64Url<T>(value);
  } catch {
    throw new Error(message);
  }
}

function validCurrency(value: unknown): value is Currency {
  return isSupportedCurrency(value);
}

function validPayment(value: unknown): value is PaymentMethod | 'ANY' {
  return value === 'CASH' || value === 'LIGHTNING' || value === 'ANY';
}

export function createPartyInvite(
  gameId: string,
  currency: Currency,
  buyInAmount: number,
  createdAt = new Date().toISOString(),
  chipsPerBuyIn?: number,
): PartyInvite {
  if (!gameId.trim()) throw new Error(t('error.partyGameIdMissing'));
  if (!Number.isFinite(buyInAmount) || buyInAmount <= 0) throw new Error(t('error.partyBuyInInvalid'));
  if (chipsPerBuyIn !== undefined && (!Number.isInteger(chipsPerBuyIn) || chipsPerBuyIn <= 0)) throw new Error(t('error.partyChipsInvalid'));
  return { v: PARTY_JOIN_VERSION, type: 'PARTY_INVITE', gameId, currency, buyInAmount, chipsPerBuyIn, createdAt };
}

export function buildPartyInviteUrl(origin: string, invite: PartyInvite): string {
  const base = new URL(origin);
  base.pathname = '/';
  base.search = '';
  base.hash = '';
  base.searchParams.set('join', encodeBase64Url(invite));
  return base.toString();
}

export function parsePartyInvite(input: string): PartyInvite {
  let encoded = input.trim();
  try {
    const url = new URL(encoded);
    encoded = url.searchParams.get('join') ?? '';
  } catch {
    // A raw encoded invite is accepted by the in-app scanner as well.
  }
  if (!encoded) throw new Error(t('error.partyQrInvalid'));
  const invite = decodeOrThrow<Partial<PartyInvite>>(encoded, 'QR de partie invalide');
  const validChips = invite.chipsPerBuyIn === undefined || (Number.isInteger(invite.chipsPerBuyIn) && (invite.chipsPerBuyIn ?? 0) > 0);
  if (invite.v !== PARTY_JOIN_VERSION || invite.type !== 'PARTY_INVITE' || typeof invite.gameId !== 'string' || !invite.gameId.trim() || !validCurrency(invite.currency) || typeof invite.buyInAmount !== 'number' || !Number.isFinite(invite.buyInAmount) || invite.buyInAmount <= 0 || !validChips || typeof invite.createdAt !== 'string') {
    throw new Error(t('error.partyQrInvalid'));
  }
  return invite as PartyInvite;
}

export function createPartyJoinResponse(input: {
  gameId: string;
  nickname: string;
  preferredPayment: PaymentMethod | 'ANY';
  lightningDestination?: string;
}): PartyJoinResponse {
  const nickname = input.nickname.trim();
  if (!input.gameId.trim()) throw new Error(t('error.partyGameMissing'));
  if (!nickname) throw new Error(t('error.nicknameRequired'));
  if (!validPayment(input.preferredPayment)) throw new Error(t('error.partyPayModeInvalid'));
  const lightningDestination = input.lightningDestination?.trim()
    ? normalizeReusableLightningDestination(input.lightningDestination)
    : undefined;
  return {
    v: PARTY_JOIN_VERSION,
    type: 'PARTY_JOIN_RESPONSE',
    gameId: input.gameId,
    nickname,
    preferredPayment: input.preferredPayment,
    lightningDestination,
  };
}

export function encodePartyJoinResponse(response: PartyJoinResponse): string {
  return `${PARTY_JOIN_RESPONSE_PREFIX}${encodeBase64Url(response)}`;
}

export function parsePartyJoinResponse(input: string): PartyJoinResponse {
  const trimmed = input.trim();
  if (!trimmed.startsWith(PARTY_JOIN_RESPONSE_PREFIX)) throw new Error(t('error.partyResponseInvalid'));
  const response = decodeOrThrow<Partial<PartyJoinResponse>>(trimmed.slice(PARTY_JOIN_RESPONSE_PREFIX.length), t('error.partyResponseInvalid'));
  if (response.v !== PARTY_JOIN_VERSION || response.type !== 'PARTY_JOIN_RESPONSE' || typeof response.gameId !== 'string' || !response.gameId.trim() || typeof response.nickname !== 'string' || !response.nickname.trim() || !validPayment(response.preferredPayment)) {
    throw new Error(t('error.partyResponseInvalid'));
  }
  const lightningDestination = typeof response.lightningDestination === 'string' && response.lightningDestination.trim()
    ? normalizeReusableLightningDestination(response.lightningDestination)
    : undefined;
  return { ...(response as PartyJoinResponse), nickname: response.nickname.trim(), lightningDestination };
}
