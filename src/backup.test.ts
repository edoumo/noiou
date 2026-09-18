import { describe, expect, it } from 'vitest';
import { t } from './i18n';
import { createSessionBackup, parseSessionBackup } from './backup';
import { appendLedgerEvent } from './ledger';
import { createEmptySession } from './session';

async function sampleSession() {
  const session = createEmptySession('2026-09-13T12:00:00Z');
  const event = await appendLedgerEvent([], {
    id: 'event-1',
    gameId: 'game-1',
    type: 'GAME_CREATED',
    at: '2026-09-13T12:00:00Z',
    payload: { currency: 'EUR' },
  });
  session.game = {
    id: 'game-1',
    currency: 'EUR',
    buyInAmount: 20,
    rebuyEnabled: true,
    rebuyAmount: 20,
    chipValue: 1,
    status: 'OPEN',
    dealer: { enabled: false, mode: 'NONE' },
    lockedBtcFiatRate: 100000,
    createdAt: '2026-09-13T12:00:00Z',
  };
  session.ledger = [event];
  return session;
}

describe('portable backups', () => {
  it('round-trips an integrity-checked session', async () => {
    const session = await sampleSession();
    const raw = await createSessionBackup(session, '2026-09-13T13:00:00Z');
    const restored = await parseSessionBackup(raw);
    expect(restored.game?.id).toBe('game-1');
    expect(restored.ledger).toHaveLength(1);
  });

  it('rejects a modified backup snapshot', async () => {
    const session = await sampleSession();
    const raw = await createSessionBackup(session);
    const tampered = JSON.parse(raw) as { snapshot: { game: { buyInAmount: number } } };
    tampered.snapshot.game.buyInAmount = 999;
    await expect(parseSessionBackup(JSON.stringify(tampered))).rejects.toThrow(t('error.backupDigest'));
  });
});
