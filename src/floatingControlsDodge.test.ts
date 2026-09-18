import { describe, expect, it } from 'vitest';
import { DODGE_CLASS, installFloatingControlsDodge, primaryActionInBand } from './floatingControlsDodge';

/** Minimal DOM stub: rectangles are declared per element, selectors map to lists. */
interface StubElement {
  rect: { top: number; bottom: number; left: number; right: number; width: number; height: number };
  getBoundingClientRect(): DOMRect;
}

function element(top: number, bottom: number, left = 0, right = 100): StubElement {
  const rect = { top, bottom, left, right, width: right - left, height: bottom - top };
  return { rect, getBoundingClientRect: () => rect as unknown as DOMRect };
}

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

describe('floating controls dodge', () => {
  it('does not dodge when no primary action sits in the band', () => {
    const doc = docStub({
      '.party-join-launcher, .new-game-fab': [element(700, 744)],
      'button.primary.wide, button.wide-mobile, button.primary': [element(100, 140)],
    });
    expect(primaryActionInBand(doc, winStub())).toBe(false);
  });

  it('dodges when a primary action overlaps a floating shortcut', () => {
    const doc = docStub({
      '.party-join-launcher, .new-game-fab': [element(720, 764, 12, 220)],
      // The CTA travels through the band and intersects the launcher box.
      'button.primary.wide, button.wide-mobile, button.primary': [element(730, 771, 12, 378)],
    });
    expect(primaryActionInBand(doc, winStub())).toBe(true);
  });

  it('does not dodge when the action is in the band but beside the shortcut', () => {
    const doc = docStub({
      '.party-join-launcher, .new-game-fab': [element(720, 764, 12, 120)],
      'button.primary.wide, button.wide-mobile, button.primary': [element(730, 771, 260, 378)],
    });
    expect(primaryActionInBand(doc, winStub())).toBe(false);
  });

  it('ignores zero-size elements', () => {
    const doc = docStub({
      '.party-join-launcher, .new-game-fab': [element(720, 764)],
      'button.primary.wide, button.wide-mobile, button.primary': [element(730, 730)],
    });
    expect(primaryActionInBand(doc, winStub())).toBe(false);
  });

  it('does nothing when no floating control is rendered', () => {
    const doc = docStub({
      '.party-join-launcher, .new-game-fab': [],
      'button.primary.wide, button.wide-mobile, button.primary': [element(730, 771)],
    });
    expect(primaryActionInBand(doc, winStub())).toBe(false);
  });

  it('toggles the root class through install and cleans up', () => {
    const classes = new Set<string>();
    const doc = docStub({
      '.party-join-launcher, .new-game-fab': [element(720, 764, 12, 220)],
      'button.primary.wide, button.wide-mobile, button.primary': [element(730, 771, 12, 378)],
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
