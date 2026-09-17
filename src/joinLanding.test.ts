import { describe, expect, it } from 'vitest';
import {
  applyPendingJoinLandingScrollGuard,
  clearPendingJoinLanding,
  decidePendingJoinLanding,
  PENDING_JOIN_LANDING_KEY,
  readPendingJoinLanding,
  rememberPendingJoinLanding,
  startPendingJoinLanding,
  type LandingStorage,
} from './joinLanding';

class FakeStorage implements LandingStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  get size(): number {
    return this.map.size;
  }
}

function frameRunner() {
  const queue: Array<() => void> = [];
  return {
    requestFrame: (callback: () => void) => { queue.push(callback); },
    flush(maxRuns = 200) {
      let runs = 0;
      while (queue.length > 0 && runs < maxRuns) {
        const next = queue.shift()!;
        next();
        runs += 1;
      }
    },
  };
}

const roster2 = [{ id: 'alice' }, { id: 'carol' }];

describe('UX26-F1 pending join landing target', () => {
  it('round-trips a pending landing target with a valid player id', () => {
    const storage = new FakeStorage();
    expect(rememberPendingJoinLanding(storage, 'carol', 1234.5)).toBe(true);
    expect(readPendingJoinLanding(storage)).toEqual({ playerId: 'carol', origin: 1234.5 });
  });

  it('rejects empty player ids and tolerates corrupted payloads', () => {
    const storage = new FakeStorage();
    expect(rememberPendingJoinLanding(storage, '   ', null)).toBe(false);
    storage.setItem(PENDING_JOIN_LANDING_KEY, '{not json');
    expect(readPendingJoinLanding(storage)).toBeNull();
    storage.setItem(PENDING_JOIN_LANDING_KEY, JSON.stringify({ playerId: '' }));
    expect(readPendingJoinLanding(storage)).toBeNull();
    storage.setItem(PENDING_JOIN_LANDING_KEY, JSON.stringify({ playerId: 'carol', origin: 'x' }));
    expect(readPendingJoinLanding(storage)).toEqual({ playerId: 'carol', origin: null });
  });

  it('does not consume the target from the same page instance that wrote it', () => {
    const storage = new FakeStorage();
    rememberPendingJoinLanding(storage, 'carol', 500);
    expect(decidePendingJoinLanding({ storage, roster: roster2, pageOrigin: 500 })).toEqual({ action: 'DEFERRED' });
    // still stored: a same-instance re-render cannot consume it early
    expect(readPendingJoinLanding(storage)).not.toBeNull();
  });

  it('consumes the target on the post-reload boot (new page origin)', () => {
    const storage = new FakeStorage();
    rememberPendingJoinLanding(storage, 'carol', 500);
    expect(decidePendingJoinLanding({ storage, roster: roster2, pageOrigin: 900 })).toEqual({ action: 'SCROLL', playerId: 'carol' });
  });

  it('discards and clears the target when the player is absent from the roster', () => {
    const storage = new FakeStorage();
    rememberPendingJoinLanding(storage, 'ghost', 500);
    expect(decidePendingJoinLanding({ storage, roster: roster2, pageOrigin: 900 })).toEqual({ action: 'DISCARD' });
    expect(readPendingJoinLanding(storage)).toBeNull();
  });

  it('treats a missing origin as consumable (legacy payload without origin)', () => {
    const storage = new FakeStorage();
    storage.setItem(PENDING_JOIN_LANDING_KEY, JSON.stringify({ playerId: 'carol' }));
    expect(decidePendingJoinLanding({ storage, roster: roster2, pageOrigin: 900 })).toEqual({ action: 'SCROLL', playerId: 'carol' });
  });

  it('scrolls to the exact card once it is rendered, clears the key, and never replays', () => {
    const storage = new FakeStorage();
    rememberPendingJoinLanding(storage, 'carol', 500);
    const frames = frameRunner();
    let framesBeforeVisible = 3;
    const scrolled: string[] = [];
    const outcome = startPendingJoinLanding({
      storage,
      roster: roster2,
      pageOrigin: 900,
      findElement: (domId) => {
        if (domId !== 'player-carol') return null;
        if (framesBeforeVisible > 0) {
          framesBeforeVisible -= 1;
          return null; // not rendered yet on the first ticks
        }
        return { scrollIntoView: (options) => scrolled.push(`${domId}:${options?.behavior}:${options?.block}`) };
      },
      requestFrame: frames.requestFrame,
    });
    expect(outcome).toBe('STARTED');
    frames.flush();
    expect(scrolled).toEqual(['player-carol:smooth:start']);
    // one-shot: key removed right away
    expect(readPendingJoinLanding(storage)).toBeNull();
    // a later boot (manual refresh) finds nothing to do
    expect(startPendingJoinLanding({
      storage,
      roster: roster2,
      pageOrigin: 1200,
      findElement: () => ({ scrollIntoView: () => scrolled.push('unexpected') }),
      requestFrame: frames.requestFrame,
    })).toBe('NONE');
    expect(scrolled).toEqual(['player-carol:smooth:start']);
  });

  it('gives up deterministically when the card never renders and consumes the key', () => {
    const storage = new FakeStorage();
    rememberPendingJoinLanding(storage, 'carol', 500);
    const frames = frameRunner();
    const outcome = startPendingJoinLanding({
      storage,
      roster: roster2,
      pageOrigin: 900,
      findElement: () => null,
      requestFrame: frames.requestFrame,
      maxFrames: 5,
    });
    expect(outcome).toBe('STARTED');
    frames.flush();
    expect(readPendingJoinLanding(storage)).toBeNull();
  });

  it('clears without scrolling when the target is absent, and nothing is scheduled twice', () => {
    const storage = new FakeStorage();
    rememberPendingJoinLanding(storage, 'ghost', 500);
    const frames = frameRunner();
    const scrolled: string[] = [];
    const outcome = startPendingJoinLanding({
      storage,
      roster: roster2,
      pageOrigin: 900,
      findElement: (domId) => ({ scrollIntoView: () => scrolled.push(domId) }),
      requestFrame: frames.requestFrame,
    });
    expect(outcome).toBe('DISCARDED');
    frames.flush();
    expect(scrolled).toEqual([]);
    expect(readPendingJoinLanding(storage)).toBeNull();
  });

  it('clearPendingJoinLanding is idempotent', () => {
    const storage = new FakeStorage();
    clearPendingJoinLanding(storage);
    clearPendingJoinLanding(storage);
    expect(storage.size).toBe(0);
  });

  it('suppresses scroll restoration only while a landing target is pending', () => {
    const storage = new FakeStorage();
    const modes: string[] = [];
    const setMode = (mode: 'manual' | 'auto') => { modes.push(mode); };
    expect(applyPendingJoinLandingScrollGuard({ storage, setMode })).toBe(false);
    expect(modes).toEqual([]);
    rememberPendingJoinLanding(storage, 'carol', 500);
    expect(applyPendingJoinLandingScrollGuard({ storage, setMode })).toBe(true);
    expect(modes).toEqual(['manual']);
    clearPendingJoinLanding(storage);
    expect(applyPendingJoinLandingScrollGuard({ storage, setMode })).toBe(false);
    expect(modes).toEqual(['manual']);
  });

  it('two concurrent runners never scroll twice (second stands down once the key is consumed)', () => {
    const storage = new FakeStorage();
    rememberPendingJoinLanding(storage, 'carol', 500);
    const frames = frameRunner();
    const scrolled: string[] = [];
    const findElement = (domId: string) => ({ scrollIntoView: () => scrolled.push(domId) });
    startPendingJoinLanding({ storage, roster: roster2, pageOrigin: 900, findElement, requestFrame: frames.requestFrame });
    startPendingJoinLanding({ storage, roster: roster2, pageOrigin: 900, findElement, requestFrame: frames.requestFrame });
    frames.flush();
    expect(scrolled).toEqual(['player-carol']);
  });
});
