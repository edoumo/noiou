/**
 * NOIOU Collective Settlement: OFFLINE/TESTNET-ONLY certificate validation.
 *
 * This module neither holds keys nor signs/broadcasts transactions. It does not
 * establish that a deposit was confirmed on Bitcoin. Those require independent
 * wallet/chain adapters and dedicated regtest qualification before activation.
 */
export type CollectiveNetwork = 'regtest' | 'signet';
export type CollectiveOutcome = 'FINAL' | 'CANCEL_REFUND';

export interface CollectiveSigner {
  playerId: string;
  xOnlyPublicKey: string;
}
export interface CollectiveDeposit {
  playerId: string;
  outpoint: string;
  kind: 'BUYIN' | 'REBUY';
  sats: string;
}
export interface CollectiveChipCount {
  playerId: string;
  chips: string;
}
export interface CollectivePayout {
  playerId: string;
  /** Canonical P2TR scriptPubKey, not a Lightning invoice or a hosted wallet. */
  scriptPubKeyHex: string;
  sats: string;
}
export interface CollectiveCertificate {
  version: 1;
  gameId: string;
  network: CollectiveNetwork;
  /** Hash of the previously frozen policy/scripts, checked by a future chain adapter. */
  policyHash: string;
  outcome: CollectiveOutcome;
  /** Exact Bitcoin mining fee, deducted from the funded pot in this prototype. */
  feeSats: string;
  issuedChips: string;
  signers: CollectiveSigner[];
  deposits: CollectiveDeposit[];
  finalChips: CollectiveChipCount[];
  payouts: CollectivePayout[];
}

export const COLLECTIVE_MAX_PLAYERS = 10;
const MAX_SATS = 2_100_000_000_000_000n;
const MAX_CHIPS = 9_007_199_254_740_991n;
const HEX_32 = /^[0-9a-f]{64}$/;
const PLAYER_ID = /^[A-Za-z0-9_-]{1,64}$/;
const OUTPOINT = /^([0-9a-f]{64}):(0|[1-9][0-9]{0,9})$/;
const P2TR_SPK = /^5120[0-9a-f]{64}$/;

function ensure(condition: unknown, error: string): asserts condition {
  if (!condition) throw new Error('collective settlement: ' + error);
}

function exactKeys(value: object, keys: string[], name: string): void {
  ensure(
    Object.keys(value).sort().join('|') === [...keys].sort().join('|'),
    name + ' has missing or unexpected fields',
  );
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function atomic(value: string, label: string, max: bigint = MAX_SATS): bigint {
  ensure(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value), label + ' must be a canonical unsigned integer string');
  ensure(value.length <= 20, label + ' exceeds allowed size');
  const parsed = BigInt(value);
  ensure(parsed <= max, label + ' exceeds allowed maximum');
  return parsed;
}

export function requiredCollectiveSigners(playerCount: number): number {
  ensure(Number.isInteger(playerCount) && playerCount >= 2 && playerCount <= COLLECTIVE_MAX_PLAYERS,
    'player count must be between 2 and ' + COLLECTIVE_MAX_PLAYERS);
  return Math.floor(playerCount / 2) + 1;
}

function weightedAllocation(total: bigint, weights: Map<string, bigint>): Map<string, bigint> {
  const totalWeight = [...weights.values()].reduce((sum, weight) => sum + weight, 0n);
  ensure(totalWeight > 0n, 'settlement weights must have a positive total');
  const rows = [...weights.entries()].map(([playerId, weight]) => ({
    playerId,
    sats: (total * weight) / totalWeight,
    remainder: (total * weight) % totalWeight,
  }));
  const assigned = rows.reduce((sum, row) => sum + row.sats, 0n);
  const remainderCount = Number(total - assigned); // Always fewer than the player count.
  rows.sort((a, b) => a.remainder === b.remainder
    ? compareIds(a.playerId, b.playerId)
    : a.remainder > b.remainder ? -1 : 1);
  for (let i = 0; i < remainderCount; i += 1) rows[i].sats += 1n;
  return new Map(rows.map((row) => [row.playerId, row.sats]));
}

function canonical(c: CollectiveCertificate): CollectiveCertificate {
  return {
    version: c.version,
    gameId: c.gameId,
    network: c.network,
    policyHash: c.policyHash,
    outcome: c.outcome,
    feeSats: c.feeSats,
    issuedChips: c.issuedChips,
    signers: [...c.signers].map((s) => ({ playerId: s.playerId, xOnlyPublicKey: s.xOnlyPublicKey }))
      .sort((a, b) => compareIds(a.playerId, b.playerId)),
    deposits: [...c.deposits].map((d) => ({ playerId: d.playerId, outpoint: d.outpoint, kind: d.kind, sats: d.sats }))
      .sort((a, b) => compareIds(a.outpoint, b.outpoint)),
    finalChips: [...c.finalChips].map((s) => ({ playerId: s.playerId, chips: s.chips }))
      .sort((a, b) => compareIds(a.playerId, b.playerId)),
    payouts: [...c.payouts].map((p) => ({ playerId: p.playerId, scriptPubKeyHex: p.scriptPubKeyHex, sats: p.sats }))
      .sort((a, b) => compareIds(a.playerId, b.playerId)),
  };
}

/**
 * Validate an agreed payout certificate using integer-only BTC accounting.
 * No approval is treated as valid merely because a player ID was supplied:
 * cryptographic signature verification is deliberately NOT implemented here.
 */
export function validateCollectiveCertificate(c: CollectiveCertificate): void {
  ensure(c !== null && typeof c === 'object' && !Array.isArray(c), 'certificate must be an object');
  exactKeys(c, ['version', 'gameId', 'network', 'policyHash', 'outcome', 'feeSats', 'issuedChips', 'signers', 'deposits', 'finalChips', 'payouts'], 'certificate');
  ensure(c.version === 1, 'unknown certificate version');
  ensure(typeof c.gameId === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(c.gameId), 'invalid game ID');
  ensure(c.network === 'regtest' || c.network === 'signet', 'mainnet is not enabled');
  ensure(typeof c.policyHash === 'string' && HEX_32.test(c.policyHash), 'invalid frozen policy hash');
  ensure(c.outcome === 'FINAL' || c.outcome === 'CANCEL_REFUND', 'invalid settlement outcome');
  ensure(Array.isArray(c.signers) && Array.isArray(c.deposits) && Array.isArray(c.finalChips) && Array.isArray(c.payouts),
    'invalid collections');

  const quorum = requiredCollectiveSigners(c.signers.length);
  ensure(quorum <= c.signers.length, 'unreachable quorum');
  const ids = new Set<string>();
  const pubkeys = new Set<string>();
  for (const signer of c.signers) {
    ensure(signer !== null && typeof signer === 'object' && !Array.isArray(signer), 'invalid signer');
    exactKeys(signer, ['playerId', 'xOnlyPublicKey'], 'signer');
    ensure(typeof signer.playerId === 'string' && PLAYER_ID.test(signer.playerId), 'invalid player ID');
    ensure(typeof signer.xOnlyPublicKey === 'string' && HEX_32.test(signer.xOnlyPublicKey), 'invalid x-only public key');
    ensure(!ids.has(signer.playerId) && !pubkeys.has(signer.xOnlyPublicKey), 'duplicate player or signing key');
    ids.add(signer.playerId);
    pubkeys.add(signer.xOnlyPublicKey);
  }

  const amounts = new Map<string, bigint>([...ids].map((id) => [id, 0n]));
  const seenOutpoints = new Set<string>();
  ensure(c.deposits.length >= ids.size, 'each player must have a deposit');
  let total = 0n;
  for (const deposit of c.deposits) {
    ensure(deposit !== null && typeof deposit === 'object' && !Array.isArray(deposit), 'invalid deposit');
    exactKeys(deposit, ['playerId', 'outpoint', 'kind', 'sats'], 'deposit');
    ensure(ids.has(deposit.playerId), 'deposit by unknown player');
    ensure(deposit.kind === 'BUYIN' || deposit.kind === 'REBUY', 'invalid deposit kind');
    ensure(typeof deposit.outpoint === 'string', 'invalid outpoint');
    const match = OUTPOINT.exec(deposit.outpoint);
    ensure(match !== null && Number(match[2]) <= 0xffffffff, 'invalid outpoint');
    ensure(!seenOutpoints.has(deposit.outpoint), 'duplicate deposit outpoint');
    seenOutpoints.add(deposit.outpoint);
    const sats = atomic(deposit.sats, 'deposit');
    ensure(sats > 0n, 'zero deposit');
    amounts.set(deposit.playerId, amounts.get(deposit.playerId)! + sats);
    total += sats;
    ensure(total <= MAX_SATS, 'aggregate deposit exceeds Bitcoin supply');
  }
  for (const amount of amounts.values()) ensure(amount > 0n, 'missing player deposit');
  const fee = atomic(c.feeSats, 'mining fee');
  ensure(fee < total, 'mining fee must be less than deposits');
  const available = total - fee;
  const issued = atomic(c.issuedChips, 'issued chips', MAX_CHIPS);

  let weights: Map<string, bigint>;
  if (c.outcome === 'FINAL') {
    ensure(issued > 0n, 'final settlement needs issued chips');
    ensure(c.finalChips.length === ids.size, 'missing or extra final chip counts');
    weights = new Map();
    let totalChips = 0n;
    for (const stack of c.finalChips) {
      ensure(stack !== null && typeof stack === 'object' && !Array.isArray(stack), 'invalid final chips');
      exactKeys(stack, ['playerId', 'chips'], 'final chips');
      ensure(ids.has(stack.playerId) && !weights.has(stack.playerId), 'unknown or duplicate final chip count');
      const chips = atomic(stack.chips, 'final chips', MAX_CHIPS);
      weights.set(stack.playerId, chips);
      totalChips += chips;
      ensure(totalChips <= MAX_CHIPS, 'chip sum overflow');
    }
    ensure(totalChips === issued, 'physical chips do not reconcile');
  } else {
    ensure(issued === 0n && c.finalChips.length === 0, 'refund certificate cannot claim final game results');
    // On cancellation, proportional fees mean some players receive fewer sats
    // than deposited. Full refunds require an independently funded fee reserve.
    weights = amounts;
  }

  ensure(c.payouts.length === ids.size, 'one declared payout per player required');
  const expected = weightedAllocation(available, weights);
  const paid = new Set<string>();
  let paidSum = 0n;
  for (const payout of c.payouts) {
    ensure(payout !== null && typeof payout === 'object' && !Array.isArray(payout), 'invalid payout');
    exactKeys(payout, ['playerId', 'scriptPubKeyHex', 'sats'], 'payout');
    ensure(ids.has(payout.playerId) && !paid.has(payout.playerId), 'unknown or duplicate payout');
    ensure(typeof payout.scriptPubKeyHex === 'string' && P2TR_SPK.test(payout.scriptPubKeyHex), 'invalid P2TR destination');
    const sats = atomic(payout.sats, 'payout');
    ensure(sats === expected.get(payout.playerId), 'payout differs from deterministic chip/refund allocation');
    paid.add(payout.playerId);
    paidSum += sats;
  }
  ensure(paidSum + fee === total, 'Bitcoin funds do not reconcile');
}

/** Computes expected amounts; does not authorize a payment. */
export function expectedCollectivePayouts(c: CollectiveCertificate): Map<string, string> {
  validateCollectiveCertificate(c);
  return new Map(c.payouts.map((payout) => [payout.playerId, payout.sats]));
}

/** Stable domain-separated digest for a TESTNET certificate; not a Bitcoin signature. */
export async function collectiveCertificateDigest(c: CollectiveCertificate): Promise<string> {
  validateCollectiveCertificate(c);
  const bytes = new TextEncoder().encode('NOIOU-COLLECTIVE-SETTLEMENT-V1\n' + JSON.stringify(canonical(c)));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
