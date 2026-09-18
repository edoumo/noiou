/**
 * Floating-controls dodge (NOIOU).
 *
 * The bottom-left floating shortcuts (`party-join-launcher`, `new-game-fab`) are
 * `position: fixed`, so mid-scroll they can partially cover an in-flow primary
 * action such as « Continuer vers les joueurs ». Hiding them permanently would
 * degrade the shortcuts, so instead they step aside ONLY while a primary action
 * actually intersects their band, and come back as soon as it does not.
 *
 * The check is cheap (a handful of buttons, rAF-throttled) and purely visual:
 * no game state, ledger or network involvement.
 */

/** Buttons that must never be covered by the floating shortcuts. */
const PRIMARY_ACTION_SELECTOR = 'button.primary.wide, button.wide-mobile, button.primary';

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

/**
 * Compute whether any primary action intersects the floating band.
 * Exported for unit testing.
 */
export function primaryActionInBand(doc: Document, win: Window): boolean {
  const viewportHeight = win.innerHeight || doc.documentElement.clientHeight;
  const bandTop = viewportHeight - BAND_HEIGHT;
  const band: DOMRect = {
    x: 0,
    y: bandTop,
    width: win.innerWidth || doc.documentElement.clientWidth,
    height: BAND_HEIGHT,
    top: bandTop,
    bottom: viewportHeight,
    left: 0,
    right: win.innerWidth || doc.documentElement.clientWidth,
    toJSON: () => ({}),
  } as DOMRect;

  const floating = Array.from(doc.querySelectorAll<HTMLElement>(FLOATING_SELECTOR));
  if (floating.length === 0) return false;
  const floatingBoxes = floating.map((element) => element.getBoundingClientRect()).filter((box) => box.height > 0);
  if (floatingBoxes.length === 0) return false;

  const actions = Array.from(doc.querySelectorAll<HTMLElement>(PRIMARY_ACTION_SELECTOR));
  for (const action of actions) {
    const box = action.getBoundingClientRect();
    if (box.height === 0 || box.width === 0) continue;
    if (box.bottom < bandTop || box.top > viewportHeight) continue;
    if (!rectsOverlap(box, band)) continue;
    // Only dodge for buttons that are actually covered by a floating shortcut.
    if (floatingBoxes.some((floatingBox) => rectsOverlap(box, floatingBox))) return true;
  }
  return false;
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
    const next = primaryActionInBand(doc, win);
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
