import { describe, expect, it } from 'vitest';
import { consumePostJoinLanding, POST_JOIN_LANDING_KEY, storePostJoinLanding, type StorageLike } from './postJoinLanding';

function memoryStorage(): StorageLike & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

describe('post-join landing handoff', () => {
  it('survives a reload boundary and is consumed once for the same game', () => {
    const storage = memoryStorage();
    storePostJoinLanding(storage, 'game-1', 'player-new');

    expect(consumePostJoinLanding(storage, 'game-1')).toBe('player-new');
    expect(consumePostJoinLanding(storage, 'game-1')).toBeNull();
    expect(storage.values.has(POST_JOIN_LANDING_KEY)).toBe(false);
  });

  it('drops stale, foreign-game and malformed handoffs', () => {
    const foreign = memoryStorage();
    storePostJoinLanding(foreign, 'game-old', 'player-old');
    expect(consumePostJoinLanding(foreign, 'game-new')).toBeNull();
    expect(foreign.values.has(POST_JOIN_LANDING_KEY)).toBe(false);

    const malformed = memoryStorage();
    malformed.setItem(POST_JOIN_LANDING_KEY, '{bad json');
    expect(consumePostJoinLanding(malformed, 'game-1')).toBeNull();
    expect(malformed.values.has(POST_JOIN_LANDING_KEY)).toBe(false);
  });
});
