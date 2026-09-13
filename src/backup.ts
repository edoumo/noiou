import { verifyLedger } from './ledger';
import { parseSession, serializeSession, type SessionSnapshot } from './session';

export const BACKUP_FORMAT = 'noiou-session-backup';
export const BACKUP_VERSION = 1 as const;

export interface SessionBackupEnvelope {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  createdAt: string;
  digest: string;
  snapshot: SessionSnapshot;
}

async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createSessionBackup(snapshot: SessionSnapshot, createdAt = new Date().toISOString()): Promise<string> {
  if (!await verifyLedger(snapshot.ledger)) throw new Error('Cannot export a session with an invalid audit ledger');
  const canonicalSnapshot = serializeSession(snapshot);
  const envelope: SessionBackupEnvelope = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt,
    digest: await sha256(canonicalSnapshot),
    snapshot,
  };
  return JSON.stringify(envelope, null, 2);
}

export async function parseSessionBackup(raw: string): Promise<SessionSnapshot> {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid NOIOU backup');
  const envelope = parsed as Partial<SessionBackupEnvelope>;
  if (envelope.format !== BACKUP_FORMAT || envelope.version !== BACKUP_VERSION) throw new Error('Unsupported NOIOU backup format');
  if (!envelope.snapshot || typeof envelope.digest !== 'string') throw new Error('Incomplete NOIOU backup');

  const snapshot = parseSession(JSON.stringify(envelope.snapshot));
  const digest = await sha256(serializeSession(snapshot));
  if (digest !== envelope.digest) throw new Error('Backup integrity check failed');
  if (!await verifyLedger(snapshot.ledger)) throw new Error('Backup audit ledger is invalid');
  return snapshot;
}

export function backupFilename(snapshot: SessionSnapshot): string {
  const date = (snapshot.game?.createdAt ?? snapshot.savedAt).slice(0, 10);
  const suffix = snapshot.game?.id ? snapshot.game.id.slice(0, 8) : 'empty';
  return `noiou-${date}-${suffix}.json`;
}
