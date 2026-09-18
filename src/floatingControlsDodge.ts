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
 *     the floating band — the historical behaviour;
 *  3. any other interactive control (button, link, field, summary) that the
 *     floating shortcut would cover.
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

/** Any interactive control that must never be covered either. */
const INTERACTIVE_SELECTOR = 'button, a[href], input, select, textarea, summary, [role="button"]';

/** Elements that step aside. */
const FLOATING_SELECTOR = '.party-join-launcher, .new-game-fab';

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
 * Floating boxes currently rendered (the shortcut hitboxes).
 * Exported for unit testing.
 */
export function floatingBoxes(doc: Document): DOMRect[] {
  return Array.from(doc.querySelectorAll<HTMLElement>(FLOATING_SELECTOR))
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

  // 1. Explicit safe zones: anything marked is protected whatever its size.
  for (const zone of Array.from(doc.querySelectorAll<HTMLElement>(SAFE_ZONE_SELECTOR))) {
    if (isFloating(zone)) continue;
    const box = zone.getBoundingClientRect();
    if (!isMeasurable(box)) continue;
    if (anyOverlap(box, floating)) return true;
  }

  const viewportHeight = win.innerHeight || doc.documentElement.clientHeight;
  const bandTop = viewportHeight - BAND_HEIGHT;

  // 2. Historical behaviour: a primary action crossing the floating band and
  //    intersecting a shortcut box.
  for (const action of Array.from(doc.querySelectorAll<HTMLElement>(PRIMARY_ACTION_SELECTOR))) {
    const box = action.getBoundingClientRect();
    if (!isMeasurable(box)) continue;
    if (box.bottom < bandTop || box.top > viewportHeight) continue;
    if (anyOverlap(box, floating)) return true;
  }

  // 3. Any other interactive control the shortcut would cover: an in-flow
  //    button/field/row must never be clickable-blocked by a fixed shortcut.
  for (const control of Array.from(doc.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR))) {
    if (isFloating(control)) continue;
    const box = control.getBoundingClientRect();
    if (!isMeasurable(box)) continue;
    if (anyOverlap(box, floating)) return true;
  }

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
