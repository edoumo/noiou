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
 * Content boxes of one protected zone: the elements that actually carry text
 * (leaf-ish) and the interactive controls it contains.
 *
 * The zone's own bounding box is deliberately NOT used: a tall section (the
 * caves list, the settlement card) would always clip the floating band and the
 * shortcuts would then hide permanently. What matters is the actual ink — a
 * text line or a control the user needs to read or tap.
 */
const INTERACTIVE_TAGS = new Set(['button', 'a', 'input', 'select', 'textarea', 'summary']);

function zoneContentBoxes(zone: HTMLElement): DOMRect[] {
  const boxes: DOMRect[] = [];
  for (const element of Array.from(zone.querySelectorAll<HTMLElement>('*'))) {
    const directText = Array.from(element.childNodes).some((node) => node.nodeType === 3 && (node.textContent ?? '').trim().length > 0);
    const tag = element.tagName?.toLowerCase() ?? '';
    const interactive = INTERACTIVE_TAGS.has(tag) || element.getAttribute('role') === 'button';
    if (!directText && !interactive) continue;
    if (element.checkVisibility && !element.checkVisibility()) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width > 1 && rect.height > 1) boxes.push(rect);
  }
  // The zone's own direct text (rare) still counts.
  const direct = Array.from(zone.childNodes).some((node) => node.nodeType === 3 && (node.textContent ?? '').trim().length > 0);
  if (direct) {
    const rect = zone.getBoundingClientRect();
    if (rect.width > 1 && rect.height > 1) boxes.push(rect);
  }
  return boxes;
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

  // 1. Explicit safe zones: the zone's ink and controls are protected — but
  //    only what is actually on screen, never the whole (possibly huge) box.
  for (const zone of Array.from(doc.querySelectorAll<HTMLElement>(SAFE_ZONE_SELECTOR))) {
    if (isFloating(zone)) continue;
    for (const box of zoneContentBoxes(zone)) {
      if (anyOverlap(box, floating)) return true;
    }
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
