import type { LedgerEvent, LedgerEventDraft } from './domain';

export const GENESIS_HASH = '0'.repeat(64);

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalize(child)}`);
  return `{${entries.join(',')}}`;
}

async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function materialForHash(event: Omit<LedgerEvent, 'hash'>): string {
  return canonicalize(event);
}

export async function appendLedgerEvent(chain: readonly LedgerEvent[], draft: LedgerEventDraft): Promise<LedgerEvent> {
  const previous = chain.at(-1);
  const previousHash = previous?.hash ?? GENESIS_HASH;
  const sequence = (previous?.sequence ?? 0) + 1;
  const eventWithoutHash: Omit<LedgerEvent, 'hash'> = {
    id: draft.id ?? crypto.randomUUID(),
    gameId: draft.gameId,
    sequence,
    type: draft.type,
    at: draft.at ?? new Date().toISOString(),
    payload: draft.payload ?? {},
    previousHash,
  };
  const hash = await sha256(materialForHash(eventWithoutHash));
  return { ...eventWithoutHash, hash };
}

export async function verifyLedger(chain: readonly LedgerEvent[]): Promise<boolean> {
  let expectedPreviousHash = GENESIS_HASH;
  let expectedSequence = 1;

  for (const event of chain) {
    if (event.sequence !== expectedSequence) return false;
    if (event.previousHash !== expectedPreviousHash) return false;

    const { hash, ...withoutHash } = event;
    const expectedHash = await sha256(materialForHash(withoutHash));
    if (hash !== expectedHash) return false;

    expectedPreviousHash = event.hash;
    expectedSequence += 1;
  }

  return true;
}
