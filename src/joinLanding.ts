/**
 * UX26-F1 — deterministic landing target for QR/handshake joins.
 *
 * The organizer device accepts a join response, saves the session and reloads the page
 * (state rebuild cycle kept from the JOIN16 release). After such a reload the roster
 * already contains the new player, so the classic "player count increased" detection
 * cannot fire and the landing used to depend on the browser scroll restoration, which is
 * not deterministic. The accepted player id is therefore persisted in sessionStorage
 * (survives the reload, scoped to the tab) and consumed exactly once, when the roster is
 * actually rendered, by scrolling to the exact new player card.
 *
 * The one-shot key is written by PartyJoinControl.acceptResponse before the reload and
 * consumed by GuidedLobbyControl on the next page boot. The stored `origin` records the
 * performance.timeOrigin of the accepting page instance so a same-instance re-render
 * (before the navigation actually happens) can never consume the target early; only the
 * post-reload boot consumes it.
 */

export const PENDING_JOIN_LANDING_KEY = 'noiou.pending-join-landing.v1';

export interface LandingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PendingJoinLandingRecord {
  playerId: string;
  /** performance.timeOrigin of the page instance that accepted the join (null when unavailable). */
  origin: number | null;
}

/** Page origin of the current document, used to distinguish the accepting instance from the post-reload boot. */
export function readPageOrigin(): number | null {
  if (typeof window === 'undefined') return null;
  const origin = window.performance?.timeOrigin;
  return typeof origin === 'number' && Number.isFinite(origin) ? origin : null;
}

/** Remember the player the organizer must land on once the post-join reload has rebuilt the view. */
export function rememberPendingJoinLanding(
  storage: LandingStorage,
  playerId: string,
  origin: number | null,
): boolean {
  const clean = playerId.trim();
  if (!clean) return false;
  try {
    const payload: PendingJoinLandingRecord = { playerId: clean, origin };
    storage.setItem(PENDING_JOIN_LANDING_KEY, JSON.stringify(payload));
    return true;
  } catch {
    // sessionStorage can be unavailable (private mode restrictions): the join itself must never fail.
    return false;
  }
}

export function readPendingJoinLanding(storage: LandingStorage): PendingJoinLandingRecord | null {
  try {
    const raw = storage.getItem(PENDING_JOIN_LANDING_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const candidate = parsed as Partial<PendingJoinLandingRecord>;
    if (typeof candidate.playerId !== 'string' || !candidate.playerId.trim()) return null;
    const origin = typeof candidate.origin === 'number' && Number.isFinite(candidate.origin)
      ? candidate.origin
      : null;
    return { playerId: candidate.playerId.trim(), origin };
  } catch {
    return null;
  }
}

export function clearPendingJoinLanding(storage: LandingStorage): void {
  try {
    storage.removeItem(PENDING_JOIN_LANDING_KEY);
  } catch {
    // one-shot cleanup must never break the flow
  }
}

export type PendingJoinLandingDecision =
  | { action: 'NONE' }
  | { action: 'DEFERRED' }
  | { action: 'DISCARD' }
  | { action: 'SCROLL'; playerId: string };

/**
 * Decide what to do with a persisted landing target for the currently loaded roster.
 * - NONE: no pending target.
 * - DEFERRED: the target was written by this very page instance — the reload has not happened
 *   yet, never consume early (only the post-reload boot lands).
 * - DISCARD: the target points at a player that no longer exists (stale/cleared session);
 *   consume the one-shot key without scrolling.
 * - SCROLL: the target exists in the roster; the caller scrolls to it and consumes the key.
 */
export function decidePendingJoinLanding(args: {
  storage: LandingStorage;
  roster: readonly { id: string }[];
  pageOrigin: number | null;
}): PendingJoinLandingDecision {
  const record = readPendingJoinLanding(args.storage);
  if (!record) return { action: 'NONE' };
  if (record.origin !== null && args.pageOrigin !== null && record.origin === args.pageOrigin) {
    return { action: 'DEFERRED' };
  }
  if (!args.roster.some((player) => player.id === record.playerId)) {
    clearPendingJoinLanding(args.storage);
    return { action: 'DISCARD' };
  }
  return { action: 'SCROLL', playerId: record.playerId };
}

export type PendingJoinLandingOutcome = 'NONE' | 'DEFERRED' | 'DISCARDED' | 'STARTED';

/**
 * Consume a pending join landing target: wait (over animation frames, not arbitrary timeouts)
 * until the exact `#player-<id>` card is actually rendered, then scroll to it with the same
 * scrollIntoView options as the classic late-add landings, and clear the one-shot key
 * immediately so no later render, manual refresh or other player addition can replay it.
 */
export function startPendingJoinLanding(args: {
  storage: LandingStorage;
  roster: readonly { id: string }[];
  pageOrigin: number | null;
  findElement: (domId: string) => { scrollIntoView: (options?: ScrollIntoViewOptions) => void } | null;
  requestFrame: (callback: () => void) => void;
  maxFrames?: number;
}): PendingJoinLandingOutcome {
  const decision = decidePendingJoinLanding(args);
  if (decision.action === 'NONE') return 'NONE';
  if (decision.action === 'DEFERRED') return 'DEFERRED';
  if (decision.action === 'DISCARD') return 'DISCARDED';

  const targetId = decision.playerId;
  const maxFrames = args.maxFrames ?? 60;
  let attempts = 0;

  const attempt = () => {
    // Re-check ownership on every tick: if another runner (or a previous frame) already consumed
    // or cleared the key, this runner must stand down instead of scrolling a second time.
    const current = readPendingJoinLanding(args.storage);
    if (!current || current.playerId !== targetId) return;

    const element = args.findElement(`player-${targetId}`);
    if (element) {
      // Consume the one-shot key before scrolling: a later render or manual refresh can never replay it.
      clearPendingJoinLanding(args.storage);
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    attempts += 1;
    if (attempts < maxFrames) {
      args.requestFrame(attempt);
    } else {
      // The card never rendered (session changed mid-flight): consume the key anyway so the
      // one-shot semantics stay deterministic instead of firing on unrelated future renders.
      if (readPendingJoinLanding(args.storage)?.playerId === targetId) clearPendingJoinLanding(args.storage);
    }
  };

  attempt();
  return 'STARTED';
}

/**
 * When a QR join reload is in flight, suppress the browser's (non-deterministic) scroll
 * restoration for this document so the one-shot landing scroll above is the only scroll
 * applied after the reload. No-op (and no behaviour change) when no landing target is pending.
 */
export function applyPendingJoinLandingScrollGuard(args: {
  storage: LandingStorage;
  setMode: (mode: 'manual' | 'auto') => void;
}): boolean {
  try {
    if (!args.storage.getItem(PENDING_JOIN_LANDING_KEY)) return false;
    args.setMode('manual');
    return true;
  } catch {
    return false;
  }
}
