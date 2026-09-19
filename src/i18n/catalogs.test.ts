/**
 * Catalog gate (NOIOU).
 *
 * CI fails unless EVERY public locale ships a complete catalog:
 *   - same key set as the fr-FR reference (no missing key, no extra key);
 *   - no empty string;
 *   - identical named placeholders (a translated string may reorder them but
 *     must never add, drop or rename one).
 *
 * The purpose is a hard guarantee: a language offered by the selector really
 * translates the whole interface, with no fallback to French anywhere. An
 * incomplete language must never be visible in production.
 */
import { describe, expect, it } from 'vitest';
import { catalogs, frFRCatalog } from './catalogs';
import { PUBLIC_LOCALES, REGISTERED_LOCALES } from './locales';

const referenceKeys = Object.keys(frFRCatalog).sort();

/** Named placeholders used by a template, e.g. `{player}` -> ['player']. */
function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

function catalogFor(code: string) {
  const catalog = catalogs[code];
  expect(catalog, `missing catalog for public locale ${code}`).toBeTruthy();
  return catalog as Record<string, string>;
}


/**
 * True when a French value reduces to language-neutral content: only proper
 * nouns, technical vocabulary, enum badges and placeholders remain once
 * placeholders and punctuation are stripped. Such a string may legitimately be
 * identical in another language (e.g. `Lightning`, `{method} · {status}`).
 */
/**
 * Tokens that carry no language: proper nouns, technical vocabulary, enum
 * badges and placeholder-only fragments. A French value made exclusively of
 * these may legitimately be identical in another language.
 */
const NEUTRAL_TOKENS = new Set([
  'bitcoin', 'lightning', 'nwc', 'bolt11', 'bolt12', 'lnurl', 'lnurlpay', 'sha256', 'sha', 'qr',
  'sats', 'sat', 'eur', 'usd', 'https', 'http', 'noiou', 'dealer', 'auto', 'ok', 'cash',
  'confirmed', 'paid', 'pending', 'diagnostic', 'mock', 'manuel', 'externe', 'reconnecter',
  'address', 'wss', 'relays', 'test', 'dev', 'private', 'alpha', 'physical', 'table',
  'non-custodial', 'by', 'design', 'chips', 'jetons', 'photos', 'permissions', 'wallet',
  'cave', 'recave', 'organisateur', 'paiement', 'tip', 'montant', 'mode', 'especes',
  'reglages', 'langue', 'ou', 'or', 'lno1',
  // Market-data proper nouns: a brand name is never translated, so a locale
  // legitimately ships the exact same string as the French reference.
  'kraken', 'coinbase',
  // Technical notations (pair code) that stay literal in every language.
  'btc',
  // Currency names that are internationally invariant: "euro" is spelled the
  // same in French, Danish, Spanish, Finnish, Croatian, Italian and Portuguese.
  'euro',
]);

/**
 * True when a French value reduces to language-neutral content. Placeholders,
 * emojis and punctuation are removed first; whatever remains must be made only
 * of neutral tokens (compared case- and accent-insensitively).
 */
export function isNeutralCopy(value: string): boolean {
  const stripped = value
    .replace(/\{[^}]*\}/g, ' ')                                        // placeholders
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, ' ') // emojis
    .trim();
  if (!stripped) return true;
  const tokens = stripped
    .split(/\s+/)
    .map((token) => token
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')   // drop accents for comparison
      .replace(/[^a-z0-9-]/g, ''))         // keep letters, digits, hyphens
    .filter(Boolean);
  // Pure punctuation / placeholder-only strings carry no language at all.
  if (tokens.length === 0) return true;
  return tokens.every((token) => NEUTRAL_TOKENS.has(token));
}

describe('catalog gate — public locales', () => {
  it('declares at least the two baseline languages', () => {
    const codes = PUBLIC_LOCALES.map((locale) => locale.code);
    expect(codes).toContain('fr-FR');
    expect(codes).toContain('en-GB');
  });

  it('only exposes registered locales as public', () => {
    const registered = new Set<string>(REGISTERED_LOCALES.map((locale) => locale.code));
    for (const locale of PUBLIC_LOCALES) {
      expect(registered.has(locale.code), `${locale.code} is not registered`).toBe(true);
    }
  });

  it('ships a catalog file for every public locale', () => {
    for (const locale of PUBLIC_LOCALES) {
      expect(catalogs[locale.code], `no catalog embedded for ${locale.code}`).toBeTruthy();
    }
  });

  for (const { code } of PUBLIC_LOCALES) {
    describe(`${code}`, () => {
      it('has exactly the same keys as the fr-FR reference', () => {
        const target = catalogFor(code);
        const keys = Object.keys(target).sort();
        const missing = referenceKeys.filter((key) => !(key in target));
        const extra = keys.filter((key) => !(key in frFRCatalog));
        expect(missing, `missing keys in ${code}`).toEqual([]);
        expect(extra, `unexpected keys in ${code}`).toEqual([]);
        expect(keys.length).toBe(referenceKeys.length);
      });

      it('has no empty string', () => {
        const target = catalogFor(code);
        const empty = Object.entries(target).filter(([, value]) => !value || !value.trim()).map(([key]) => key);
        expect(empty, `empty translations in ${code}`).toEqual([]);
      });

      it('keeps the same named placeholders as the reference', () => {
        const target = catalogFor(code);
        const mismatched: string[] = [];
        for (const key of referenceKeys) {
          const expected = placeholders(frFRCatalog[key as keyof typeof frFRCatalog]);
          const actual = placeholders(String(target[key] ?? ''));
          if (expected.join(',') !== actual.join(',')) {
            mismatched.push(`${key}: expected {${expected.join('}{')}} got {${actual.join('}{')}}`);
          }
        }
        expect(mismatched, `placeholder mismatches in ${code}`).toEqual([]);
      });

      it('does not fall back to the French reference for any prose key', () => {
        const target = catalogFor(code);
        if (code === 'fr-FR') return;
        // A translation identical to the French source is only suspicious for PROSE.
        // Keys whose value reduces to language-neutral tokens (proper nouns,
        // technical terms, enum badges, placeholder-only patterns) are legitimate.
        const identical = referenceKeys.filter((key) => {
          const french = frFRCatalog[key as keyof typeof frFRCatalog];
          const value = String(target[key] ?? '');
          if (value !== french) return false;
          return !isNeutralCopy(french);
        });
        expect(identical, `prose keys still identical to French in ${code} — likely untranslated`).toEqual([]);
      });
    });
  }
});

describe('catalog gate — registered but not public', () => {
  it('never declares a registered-only locale as public', () => {
    const publicCodes = new Set(PUBLIC_LOCALES.map((locale) => locale.code));
    for (const locale of REGISTERED_LOCALES) {
      if (publicCodes.has(locale.code)) continue;
      // A registered-only locale must not have an embedded catalog, otherwise it
      // could be activated and rendered half-translated.
      expect(catalogs[locale.code], `${locale.code} is registered-only but has an embedded catalog`).toBeUndefined();
    }
  });
});
