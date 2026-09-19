/**
 * Floating-controls dodge (NOIOU).
 *
 * The bottom-left floating shortcuts (`party-join-launcher`, `new-game-fab`) are
 * `position: fixed`, so mid-scroll they can partially cover an in-flow primary
 * action — or, worse, an important reading/control zone such as the Lightning /
 * NWC block, the settlement controls, the audit log or the backup section.
 * Hiding them permanently would degrade the shortcuts, so instead they step
 * aside ONLY while they would actually cover something that matters, and come
 * back as soon as the overlap is gone.
 *
 * Protected targets, in decreasing priority:
 *  1. explicit safe zones — any element carrying the `data-floating-safe-zone`
 *     attribute (organizer Lightning / NWC block, settlement explanations and
 *     controls, audit log, backup & transfer, locked-rate summary);
 *  2. primary actions (`.primary`, `.wide`, `.wide-mobile`) travelling through
 *     the floating band — the historical behaviour.
 *
 * A fixed control is deliberately never treated as "its own obstacle": the
 * shortcuts and the settings pill must keep their own hitbox reachable, and
 * every mandated important zone is enumerated through `data-floating-safe-zone`.
 *
 * The check is cheap (a handful of elements, rAF-throttled) and purely visual:
 * no game state, ledger or network involvement.
 */

/** Buttons that must never be covered by the floating shortcuts. */
const PRIMARY_ACTION_SELECTOR = 'button.primary.wide, button.wide-mobile, button.primary';

/**
 * Generic protection hook: mark any block whose text or controls must never be
 * hidden behind the floating shortcuts.
 */
export const SAFE_ZONE_SELECTOR = '[data-floating-safe-zone]';

/** Elements that step aside. */
const FLOATING_SELECTOR = '.party-join-launcher, .new-game-fab, .global-preferences:not([open])';

/**
 * The obstacles that actually capture taps: the shortcuts themselves and the
 * collapsed settings pill. The settings *container* is `pointer-events:none`,
 * so its own (much wider) box must never be used as an obstacle.
 */
const FLOATING_OBSTACLE_SELECTOR = '.party-join-launcher, .new-game-fab, .global-preferences:not([open]) > summary';

/** Band (px above the viewport bottom) occupied by the floating controls. */
const BAND_HEIGHT = 170;

/** Root class toggled while a primary action sits inside the band. */
export const DODGE_CLASS = 'floating-controls-dodging';

export interface DodgeDeps {
  doc: Document;
  win: Window;
}

function rectsOverlap(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function isMeasurable(box: DOMRect): boolean {
  return box.height > 0 && box.width > 0;
}

function anyOverlap(box: DOMRect, others: readonly DOMRect[]): boolean {
  return others.some((other) => rectsOverlap(box, other));
}

/**
 * Floating boxes currently rendered (the shortcut hitboxes) — these are the
 * obstacles that can cover protected content.
 * Exported for unit testing.
 */
export function floatingBoxes(doc: Document): DOMRect[] {
  return Array.from(doc.querySelectorAll<HTMLElement>(FLOATING_OBSTACLE_SELECTOR))
    .map((element) => element.getBoundingClientRect())
    .filter(isMeasurable);
}

/**
 * Compute whether any protected target intersects the floating shortcuts.
 *
 * Exported for unit testing.
 */
export function protectedContentInBand(doc: Document, win: Window): boolean {
  const floating = floatingBoxes(doc);
  if (floating.length === 0) return false;

  // The floating controls themselves are interactive: they must never be
  // treated as their own obstacle (that would hide them permanently).
  const floatingRoots = Array.from(doc.querySelectorAll<HTMLElement>(FLOATING_SELECTOR));
  const isFloating = (element: Element): boolean => floatingRoots.some((root) => root === element || root.contains(element));

  // 1. Explicit safe zones: anything marked is protected whatever its size, as
  //    soon as ANY part of the zone's ink/controls falls under an obstacle.
  for (const zone of Array.from(doc.querySelectorAll<HTMLElement>(SAFE_ZONE_SELECTOR))) {
    if (isFloating(zone)) continue;
    const box = zone.getBoundingClientRect();
    if (!isMeasurable(box)) continue;
    if (anyOverlap(box, floating)) return true;
  }

  const viewportHeight = win.innerHeight || doc.documentElement.clientHeight;
  const bandTop = viewportHeight - BAND_HEIGHT;

  // 2. Primary actions: an in-flow CTA entering the floating band must never be
  //    partially covered (historical behaviour, kept unchanged).
  for (const action of Array.from(doc.querySelectorAll<HTMLElement>(PRIMARY_ACTION_SELECTOR))) {
    const box = action.getBoundingClientRect();
    if (!isMeasurable(box)) continue;
    if (box.bottom < bandTop || box.top > viewportHeight) continue;
    if (anyOverlap(box, floating)) return true;
  }

  // Deliberately NOT a rule: "any interactive control under an obstacle".
  // On a long page a fixed control would then hide itself permanently and
  // become unreachable — the opposite of the goal. The mandated important
  // zones are enumerated above, and a control they contain is already covered
  // by rule 1 through its zone.

  return false;
}

/**
 * Backwards-compatible alias used by the historical unit tests and callers.
 * @deprecated prefer `protectedContentInBand`, which also covers safe zones and
 * interactive controls. Kept so existing imports keep working.
 */
export function primaryActionInBand(doc: Document, win: Window): boolean {
  return protectedContentInBand(doc, win);
}

/**
 * Install the dodge behaviour. Returns a cleanup function.
 * Safe to call in a non-browser environment (no-op).
 */
export function installFloatingControlsDodge({ doc, win }: DodgeDeps): () => void {
  if (!doc || !win) return () => {};

  let frame = 0;
  let current = false;

  function apply() {
    frame = 0;
    const next = protectedContentInBand(doc, win);
    if (next === current) return;
    current = next;
    doc.documentElement.classList.toggle(DODGE_CLASS, next);
  }

  function schedule() {
    if (frame) return;
    frame = win.requestAnimationFrame(apply);
  }

  apply();

  win.addEventListener('scroll', schedule, { passive: true });
  win.addEventListener('resize', schedule);
  const MutationObserverCtor = (win as unknown as { MutationObserver?: typeof MutationObserver }).MutationObserver;
  const observer = typeof MutationObserverCtor === 'function' ? new MutationObserverCtor(schedule) : null;
  observer?.observe(doc.body, { childList: true, subtree: true });

  return () => {
    if (frame) win.cancelAnimationFrame(frame);
    win.removeEventListener('scroll', schedule);
    win.removeEventListener('resize', schedule);
    observer?.disconnect();
    doc.documentElement.classList.remove(DODGE_CLASS);
  };
}
