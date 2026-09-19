import { describe, expect, it } from 'vitest';
import {
  DODGE_CLASS,
  floatingBoxes,
  installFloatingControlsDodge,
  primaryActionInBand,
  protectedContentInBand,
  SAFE_ZONE_SELECTOR,
} from './floatingControlsDodge';

/**
 * Minimal DOM stub: rectangles are declared per element, selectors map to lists.
 * A "zone" also exposes its content elements so the ink-based rule can be
 * exercised exactly like in the browser.
 */
interface StubElement {
  rect: { top: number; bottom: number; left: number; right: number; width: number; height: number };
  childNodes: unknown[];
  tagName: string;
  getAttribute(name: string): string | null;
  getBoundingClientRect(): DOMRect;
  querySelectorAll(selector: string): StubElement[];
  checkVisibility?(): boolean;
  contains(other: unknown): boolean;
}

function element(top: number, bottom: number, left = 0, right = 100): StubElement {
  const rect = { top, bottom, left, right, width: right - left, height: bottom - top };
  return {
    rect,
    childNodes: [],
    tagName: 'DIV',
    getAttribute: () => null,
    getBoundingClientRect: () => rect as unknown as DOMRect,
    querySelectorAll: () => [],
    checkVisibility: () => true,
    contains: () => false,
  };
}

/** A safe zone whose content is one text-bearing element with its own box. */
function zoneWithContent(zoneTop: number, zoneBottom: number, contentTop: number, contentBottom: number, left = 0, right = 100): StubElement {
  const zone = element(zoneTop, zoneBottom, left, right);
  const content = element(contentTop, contentBottom, left, right);
  // The content element carries a text node directly.
  content.childNodes = [{ nodeType: 3, textContent: 'Zone content' }];
  zone.querySelectorAll = () => [content];
  return zone;
}

const FLOATING_KEY = '.party-join-launcher, .new-game-fab, .global-preferences:not([open]) > summary';
const PRIMARY_KEY = 'button.primary.wide, button.wide-mobile, button.primary';
const SAFE_KEY = '[data-floating-safe-zone]';

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
    });
    expect(protectedContentInBand(doc, winStub())).toBe(false);
  });

  it('dodges when a primary action overlaps a floating shortcut', () => {
    const doc = docStub({
      [FLOATING_KEY]: [element(720, 764, 12, 220)],
      [PRIMARY_KEY]: [element(730, 771, 12, 378)],
      [SAFE_KEY]: [],
    });
    expect(protectedContentInBand(doc, winStub())).toBe(true);
  });

  it('does not dodge when the action is in the band but beside the shortcut', () => {
    const doc = docStub({
      [FLOATING_KEY]: [element(720, 764, 12, 120)],
      [PRIMARY_KEY]: [element(730, 771, 260, 378)],
      [SAFE_KEY]: [],
    });
    expect(protectedContentInBand(doc, winStub())).toBe(false);
  });

  it('ignores zero-size elements', () => {
    const doc = docStub({
      [FLOATING_KEY]: [element(720, 764)],
      [PRIMARY_KEY]: [element(730, 730)],
      [SAFE_KEY]: [],
    });
    expect(protectedContentInBand(doc, winStub())).toBe(false);
  });

  it('does nothing when no floating control is rendered', () => {
    const doc = docStub({
      [FLOATING_KEY]: [],
      [PRIMARY_KEY]: [element(730, 771)],
      [SAFE_KEY]: [zoneWithContent(730, 900, 730, 900)],
    });
    expect(protectedContentInBand(doc, winStub())).toBe(false);
  });

  it('keeps the historical exported helper working', () => {
    const doc = docStub({
      [FLOATING_KEY]: [element(720, 764, 12, 220)],
      [PRIMARY_KEY]: [element(730, 771, 12, 378)],
      [SAFE_KEY]: [],
    });
    expect(primaryActionInBand(doc, winStub())).toBe(true);
  });

  it('toggles the root class through install and cleans up', () => {
    const classes = new Set<string>();
    const doc = docStub({
      [FLOATING_KEY]: [element(720, 764, 12, 220)],
      [PRIMARY_KEY]: [element(730, 771, 12, 378)],
      [SAFE_KEY]: [],
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
  it('protects zone content that a shortcut would cover', () => {
    const doc = docStub({
      [FLOATING_KEY]: [element(720, 764, 12, 220)],
      [PRIMARY_KEY]: [],
      // The zone extends far outside the band, but its CONTENT sits under the
      // shortcut — that is what must be protected.
      [SAFE_KEY]: [zoneWithContent(200, 900, 700, 900, 0, 390)],
    });
    expect(protectedContentInBand(doc, winStub())).toBe(true);
  });

  it('does NOT hide the shortcuts for a tall zone whose content is elsewhere', () => {
    // This is the regression the live acceptance caught: a big section whose
    // box merely spans the band must not hide the floating controls forever.
    const doc = docStub({
      [FLOATING_KEY]: [element(720, 764, 12, 220)],
      [PRIMARY_KEY]: [],
      [SAFE_KEY]: [zoneWithContent(100, 1400, 100, 300, 0, 390)],
    });
    expect(protectedContentInBand(doc, winStub())).toBe(false);
  });

  it('protects every mandated zone independently', () => {
    for (const zone of ['nwc', 'ledger', 'backup', 'settlement-controls', 'settlement-control', 'lightning-organizer', 'locked-rate', 'final-stacks', 'collections', 'dealer-tips', 'rate']) {
      const doc = docStub({
        [FLOATING_KEY]: [element(700, 744, 12, 260)],
        [PRIMARY_KEY]: [],
        [SAFE_KEY]: [zoneWithContent(300, 1300, 690, 800, 0, 390)],
      });
      expect(protectedContentInBand(doc, winStub()), `${zone} not protected`).toBe(true);
    }
  });

  it('ignores hidden content (collapsed details)', () => {
    const zone = zoneWithContent(300, 1300, 690, 800, 0, 390);
    zone.querySelectorAll = () => {
      const hidden = element(690, 800, 0, 390);
      hidden.childNodes = [{ nodeType: 3, textContent: 'hidden copy' }];
      hidden.checkVisibility = () => false;
      return [hidden];
    };
    const doc = docStub({
      [FLOATING_KEY]: [element(700, 744, 12, 260)],
      [PRIMARY_KEY]: [],
      [SAFE_KEY]: [zone],
    });
    expect(protectedContentInBand(doc, winStub())).toBe(false);
  });

  it('does not treat the floating shortcuts themselves as obstacles', () => {
    const launcher = element(720, 764, 12, 220);
    const outside = element(100, 140, 0, 100);
    const doc = docStub({
      [FLOATING_KEY]: [launcher],
      [PRIMARY_KEY]: [],
      [SAFE_KEY]: [outside],
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
