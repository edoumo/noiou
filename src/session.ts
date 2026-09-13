import type { Contribution, Game, LedgerEvent, Payout, Player, ProjectDonation, SettlementResult } from './domain';

export const SESSION_STORAGE_KEY = 'noiou.session.v1';
export const SESSION_SCHEMA_VERSION = 1 as const;

export interface SessionSnapshot {
  schemaVersion: typeof SESSION_SCHEMA_VERSION;
  savedAt: string;
  game: Game | null;
  players: Player[];
  contributions: Contribution[];
  stacks: Record<string, number>;
  stacksLocked: boolean;
  settlement: SettlementResult | null;
  payouts: Payout[];
  dealerPaid: boolean;
  ledger: LedgerEvent[];
  projectDonations: ProjectDonation[];
}

export function createEmptySession(savedAt = new Date().toISOString()): SessionSnapshot {
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    savedAt,
    game: null,
    players: [],
    contributions: [],
    stacks: {},
    stacksLocked: false,
    settlement: null,
    payouts: [],
    dealerPaid: false,
    ledger: [],
    projectDonations: [],
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
  if (!candidate.stacks || typeof candidate.stacks !== 'object') throw new Error('Invalid stacks');
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
}
