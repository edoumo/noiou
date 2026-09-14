import type { Contribution, DealerTip, Game, LedgerEvent, Payout, Player, ProjectDonation, SettlementResult } from './domain';
import type { LightningInvoice } from './lightning';

export const SESSION_STORAGE_KEY = 'noiou.session.v1';
export const SESSION_SCHEMA_VERSION = 1 as const;
export const SESSION_CLEARED_EVENT = 'noiou:session-cleared';

export interface SessionSnapshot {
  schemaVersion: typeof SESSION_SCHEMA_VERSION;
  savedAt: string;
  game: Game | null;
  players: Player[];
  contributions: Contribution[];
  mockInvoices: Record<string, LightningInvoice>;
  stacks: Record<string, number>;
  stacksLocked: boolean;
  settlement: SettlementResult | null;
  payouts: Payout[];
  dealerPaid: boolean;
  ledger: LedgerEvent[];
  projectDonations: ProjectDonation[];
  /** Added during schema v1 incubation; optional keeps old local sessions/backups readable byte-for-byte. */
  dealerTips?: DealerTip[];
}

export function createEmptySession(savedAt = new Date().toISOString()): SessionSnapshot {
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    savedAt,
    game: null,
    players: [],
    contributions: [],
    mockInvoices: {},
    stacks: {},
    stacksLocked: false,
    settlement: null,
    payouts: [],
    dealerPaid: false,
    ledger: [],
    projectDonations: [],
    dealerTips: [],
  };
}

export function serializeSession(snapshot: SessionSnapshot): string {
  return JSON.stringify(snapshot);
}

export function parseSession(raw: string): SessionSnapshot {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid session payload');
  const candidate = parsed as Partial<SessionSnapshot>;
  if (candidate.schemaVersion !== SESSION_SCHEMA_VERSION) throw new Error('Unsupported session schema version');
  if (!Array.isArray(candidate.players) || !Array.isArray(candidate.contributions) || !Array.isArray(candidate.payouts) || !Array.isArray(candidate.ledger) || !Array.isArray(candidate.projectDonations)) {
    throw new Error('Invalid session collections');
  }
  if (candidate.dealerTips !== undefined && !Array.isArray(candidate.dealerTips)) throw new Error('Invalid dealer tips');
  if (!candidate.stacks || typeof candidate.stacks !== 'object' || !candidate.mockInvoices || typeof candidate.mockInvoices !== 'object') throw new Error('Invalid session maps');
  if (typeof candidate.stacksLocked !== 'boolean' || typeof candidate.dealerPaid !== 'boolean' || typeof candidate.savedAt !== 'string') {
    throw new Error('Invalid session state');
  }
  return candidate as SessionSnapshot;
}

export interface SessionStorageReader {
  getItem(key: string): string | null;
}

export interface SessionStorageWriter {
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function loadSession(storage: SessionStorageReader): SessionSnapshot | null {
  const raw = storage.getItem(SESSION_STORAGE_KEY);
  return raw ? parseSession(raw) : null;
}

export function saveSession(storage: SessionStorageWriter, snapshot: SessionSnapshot): void {
  storage.setItem(SESSION_STORAGE_KEY, serializeSession(snapshot));
}

export function clearSession(storage: SessionStorageWriter): void {
  storage.removeItem(SESSION_STORAGE_KEY);
  if (typeof window !== 'undefined' && storage === window.localStorage) {
    window.dispatchEvent(new Event(SESSION_CLEARED_EVENT));
  }
}

/**
 * Returns true when an active session has already committed to real receive-only NWC receipts.
 * The GAME_CREATED ledger event is the durable source for sessions created before the Game
 * object gained an explicit lightningReceiveMode field. A persisted NWC invoice is an extra
 * fail-safe so a partially migrated/restored session can never silently fall back to mock.
 */
export function sessionRequiresNwcReceipts(snapshot: SessionSnapshot | null): boolean {
  const game = snapshot?.game;
  if (!game || (game.status !== 'OPEN' && game.status !== 'SETTLING')) return false;

  if (game.lightningReceiveMode === 'NWC_RECEIVE_ONLY') return true;

  const created = snapshot.ledger.find((event) => event.gameId === game.id && event.type === 'GAME_CREATED');
  if (created?.payload.lightningReceiveMode === 'NWC_RECEIVE_ONLY') return true;

  return Object.values(snapshot.mockInvoices).some((invoice) => invoice.source === 'NWC');
}

export function storageRequiresNwcReceipts(storage: SessionStorageReader): boolean {
  try {
    return sessionRequiresNwcReceipts(loadSession(storage));
  } catch {
    // A malformed/tampered session is handled by the app's existing integrity gates. Do not
    // infer permission to use real funds from data that cannot be parsed.
    return false;
  }
}
