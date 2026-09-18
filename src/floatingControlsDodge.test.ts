/**
 * Floating-controls dodge — safe-zone coverage (NOIOU).
 *
 * The mandate §8/§9: the floating shortcuts (Nouvelle partie / QR de partie /
 * Rejoindre) must never cover important zones — organizer Lightning, the NWC
 * block, collection/settlement controls and explanations, the audit log and the
 * backup & transfer section. The historical behaviour (dodging a primary action
 * crossing the band) must keep working unchanged.
 */
import { describe, expect, it } from 'vitest';
import {
  DODGE_CLASS,
  floatingBoxes,
  installFloatingControlsDodge,
  primaryActionInBand,
  protectedContentInBand,
  SAFE_ZONE_SELECTOR,
} from './floatingControlsDodge';

interface StubElement {
  rect: { top: number; bottom: number; left: number; right: number; width: number; height: number };
  getBoundingClientRect(): DOMRect;
  contains(other: unknown): boolean;
}

function element(top: number, bottom: number, left = 0, right = 100): StubElement {
  const rect = { top, bottom, left, right, width: right - left, height: bottom - top };
  return {
    rect,
    getBoundingClientRect: () => rect as unknown as DOMRect,
    contains: () => false,
  };
}

const FLOATING_KEY = '.party-join-launcher, .new-game-fab, .global-preferences:not([open]) > summary';
const PRIMARY_KEY = 'button.primary.wide, button.wide-mobile, button.primary';
const SAFE_KEY = '[data-floating-safe-zone]';
const INTERACTIVE_KEY = 'button, a[href], input, select, textarea, summary, [role="button"]';

function docStub(groups: Record<string, StubElement[]>, classes = new Set<string>()) {
  return {
    querySelectorAll(selector: string) { return groups[selector] ?? []; },
    documentElement: {
      classList: {
        toggle(name: string, on: boolean) { if (on) classes.add(name); else classes.delete(name); },
        remove(name: string) { classes.delete(name); },
      },
    },
    body: {},
  } as unknown as Document;
}

function winStub(height = 800, width = 390) {
  return { innerHeight: height, innerWidth: width } as unknown as Window;
}

describe('floating controls dodge — historical behaviour', () => {
  it('does not dodge when nothing protected sits in the band', () => {
    const doc = docStub({
      [FLOATING_KEY]: [element(700, 744)],
      [PRIMARY_KEY]: [element(100, 140)],
      [SAFE_KEY]: [],
      [INTERACTIVE_KEY]: [],
    });
    expect(protectedContentInBand(doc, winStub())).toBe(false);
  });

  it('dodges when a primary action overlaps a floating shortcut', () => {
    const doc = docStub({
      [FLOATING_KEY]: [element(720, 764, 12, 220)],
      [PRIMARY_KEY]: [element(730, 771, 12, 378)],
      [SAFE_KEY]: [],
      [INTERACTIVE_KEY]: [],
    });
    expect(protectedContentInBand(doc, winStub())).toBe(true);
  });

  it('does not dodge when the action is in the band but beside the shortcut', () => {
    const doc = docStub({
      [FLOATING_KEY]: [element(720, 764, 12, 120)],
      [PRIMARY_KEY]: [element(730, 771, 260, 378)],
      [SAFE_KEY]: [],
      [INTERACTIVE_KEY]: [],
    });
    expect(protectedContentInBand(doc, winStub())).toBe(false);
  });

  it('ignores zero-size elements', () => {
    const doc = docStub({
      [FLOATING_KEY]: [element(720, 764)],
      [PRIMARY_KEY]: [element(730, 730)],
      [SAFE_KEY]: [],
      [INTERACTIVE_KEY]: [],
    });
    expect(protectedContentInBand(doc, winStub())).toBe(false);
  });

  it('does nothing when no floating control is rendered', () => {
    const doc = docStub({
      [FLOATING_KEY]: [],
      [PRIMARY_KEY]: [element(730, 771)],
      [SAFE_KEY]: [element(730, 900)],
      [INTERACTIVE_KEY]: [element(730, 771)],
    });
    expect(protectedContentInBand(doc, winStub())).toBe(false);
  });

  it('keeps the historical exported helper working', () => {
    const doc = docStub({
      [FLOATING_KEY]: [element(720, 764, 12, 220)],
      [PRIMARY_KEY]: [element(730, 771, 12, 378)],
      [SAFE_KEY]: [],
      [INTERACTIVE_KEY]: [],
    });
    expect(primaryActionInBand(doc, winStub())).toBe(true);
  });

  it('toggles the root class through install and cleans up', () => {
    const classes = new Set<string>();
    const doc = docStub({
      [FLOATING_KEY]: [element(720, 764, 12, 220)],
      [PRIMARY_KEY]: [element(730, 771, 12, 378)],
      [SAFE_KEY]: [],
      [INTERACTIVE_KEY]: [],
    }, classes);
    const listeners: Record<string, () => void> = {};
    const win = {
      innerHeight: 800,
      innerWidth: 390,
      requestAnimationFrame: (callback: () => void) => { callback(); return 1; },
      cancelAnimationFrame: () => {},
      addEventListener: (name: string, handler: () => void) => { listeners[name] = handler; },
      removeEventListener: (name: string) => { delete listeners[name]; },
    } as unknown as Window;

    const cleanup = installFloatingControlsDodge({ doc, win });
    expect(classes.has(DODGE_CLASS)).toBe(true);

    cleanup();
    expect(classes.has(DODGE_CLASS)).toBe(false);
    expect(Object.keys(listeners)).toHaveLength(0);
  });
});

describe('floating controls dodge — protected safe zones', () => {
  it('protects a safe zone that a shortcut would cover', () => {
    const doc = docStub({
      [FLOATING_KEY]: [element(720, 764, 12, 220)],
      [PRIMARY_KEY]: [],
      // The NWC block extends under the shortcut even though no CTA is there.
      [SAFE_KEY]: [element(700, 900, 0, 390)],
      [INTERACTIVE_KEY]: [],
    });
    expect(protectedContentInBand(doc, winStub())).toBe(true);
  });

  it('protects every mandated zone independently', () => {
    for (const zone of ['nwc', 'ledger', 'backup', 'settlement-controls', 'lightning-organizer', 'locked-rate']) {
      const doc = docStub({
        [FLOATING_KEY]: [element(700, 744, 12, 260)],
        [PRIMARY_KEY]: [],
        // Every zone under test genuinely overlaps the shortcut box.
        [SAFE_KEY]: [element(690, 800, 0, 390)],
        [INTERACTIVE_KEY]: [],
      });
      expect(protectedContentInBand(doc, winStub()), `${zone} not protected`).toBe(true);
    }
  });

  it('protects an in-flow interactive control covered by a shortcut', () => {
    const doc = docStub({
      [FLOATING_KEY]: [element(720, 764, 12, 220)],
      [PRIMARY_KEY]: [],
      [SAFE_KEY]: [],
      // A plain (non-primary) button under the shortcut.
      [INTERACTIVE_KEY]: [element(730, 766, 60, 200)],
    });
    expect(protectedContentInBand(doc, winStub())).toBe(true);
  });

  it('does not treat the floating shortcuts themselves as obstacles', () => {
    // Without this guard the launcher would hide itself forever: its own button
    // lives inside its own obstacle box. Here the floating ROOT list contains
    // the launcher, so its own button is excluded from the protected set — the
    // only remaining target (a bare interactive element) sits outside.
    const launcher = element(720, 764, 12, 220);
    const outside = element(100, 140, 0, 100);
    const doc = docStub({
      [FLOATING_KEY]: [launcher],
      [PRIMARY_KEY]: [],
      [SAFE_KEY]: [],
      [INTERACTIVE_KEY]: [outside],
    });
    expect(protectedContentInBand(doc, winStub())).toBe(false);
  });

  it('exposes the documented selector used by components', () => {
    expect(SAFE_ZONE_SELECTOR).toBe('[data-floating-safe-zone]');
  });
});

describe('floating boxes', () => {
  it('lists only measurable floating boxes', () => {
    const doc = docStub({ [FLOATING_KEY]: [element(720, 764), element(0, 0)] });
    expect(floatingBoxes(doc)).toHaveLength(1);
  });
});
