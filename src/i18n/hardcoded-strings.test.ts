/**
 * Hardcoded-string gate (NOIOU).
 *
 * A "reasonable" audit of user-facing copy still written directly in the
 * components. It is deliberately NOT a naive grep: technical vocabulary that is
 * intentionally language-neutral (Bitcoin, Lightning, NWC, BOLT11, SHA-256,
 * REBUY enum members, CSS classes, identifiers) must never be flagged, and an
 * explicit allowlist documents every tolerated occurrence.
 *
 * The gate looks for French *sentences* — accented characters or French function
 * words inside a user-facing string literal or a JSX text node — in `src/`.
 * When it finds one, CI fails and the reported line points at the offending copy.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
/** Project `src/` — everything below it is scanned except the allowlists. */
const SRC = resolve(HERE, '..');

/** Files that legitimately contain French: the catalogs and the gate itself. */
const FILE_ALLOWLIST = new Set<string>([
  'i18n/catalogs.test.ts',
  'i18n/hardcoded-strings.test.ts',
]);

/** Catalog modules are exactly where translations belong — never scanned. */
const CATALOG_DIR = 'i18n/catalogs/';

/**
 * Tolerated occurrences, documented one by one. Format `<relative path>:<substring>`.
 *
 * - `preferences.ts` keeps a legacy French/English term pattern so historical
 *   button labels still classify as financial actions after a reload.
 * - `preferences.test.ts` asserts on that classification with a sample label.
 * - `App.tsx` keeps the status/step vocabulary used by `statusLabel()` and the
 *   CSS class names for the step bar; both are identifiers, not rendered copy.
 */
const OCCURRENCE_ALLOWLIST = new Set<string>([
  'preferences.ts:rémunération',
  'preferences.ts:remuneration',
  'preferences.ts:règlement',
  'preferences.ts:reçu',
  'preferences.ts:recu',
  'preferences.ts:encaisse',
  'preferences.ts:paiement',
  'preferences.ts:payout',
  'preferences.test.ts:Recave (rebuy) espèces',
  'preferences.test.ts:payout',
  'preferences.test.ts:Ajouter',
  'preferences.test.ts:Exporter',
  'App.tsx:RECEIVE_MODE_MIGRATED',
]);

/** Accented characters or French function words that betray a French sentence. */
const FRENCH_HINT = /[àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]|\b(le|la|les|des|une|un|du|au|aux|pour|avec|dans|sur|est|sont|vous|ton|ta|tes|votre|nous|cette|ce|cet|qui|que|pas|plus|sans|tout|tous|être|avoir|fait|faire|doit|peut|sera|être|ici|alors|donc|mais)\b/i;

/** Strings that are never user-facing copy even if they look French. */
const NEUTRAL = new RegExp([
  '^[\\s\\d\\W]*$',                 // empty / punctuation only
  '^[a-z][a-zA-Z0-9]*(\\.[a-zA-Z0-9]+)+$', // dotted i18n key
  '^[.#][\\w-]+$',                  // CSS selector
  '^(https?|wss?|lightning|bitcoin|nostr)',  // URLs / schemes
  '\\.(ts|tsx|css|js|json|png|svg|webmanifest)$',
  '^[a-z-]+$',                      // lowercase identifier
  '^[A-Z_]+$',                      // CONSTANT
  '^noiou\\.',                      // storage key
  '^data-',                         // data attribute
  '^(fr-FR|en-GB)$',                // locale code
].join('|'), 'i');

interface Finding { file: string; line: number; text: string }

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(full) && !/\.test\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

/**
 * Extract candidate user-facing strings from one source file:
 * - single/double quoted literals and template literals;
 * - JSX text nodes between `>` and `<`.
 * Lines that are pure comments are ignored (documentation may stay French).
 */
function candidates(source: string): { line: number; text: string }[] {
  const results: { line: number; text: string }[] = [];
  source.split('\n').forEach((raw, index) => {
    const line = raw;
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    const code = line.replace(/\/\/.*$/, '');
    for (const match of code.matchAll(/(['"`])((?:\\.|(?!\1).){8,400})\1/g)) {
      results.push({ line: index + 1, text: match[2] });
    }
    for (const match of code.matchAll(/>([^<>{}]{10,240})</g)) {
      results.push({ line: index + 1, text: match[1] });
    }
  });
  return results;
}

describe('hardcoded-string gate', () => {
  it('finds no French user-facing sentence outside the catalogs', () => {
    const findings: Finding[] = [];

    for (const file of walk(SRC)) {
      const rel = relative(SRC, file).split('\\').join('/');
      if (FILE_ALLOWLIST.has(rel) || rel.startsWith(CATALOG_DIR)) continue;
      const source = readFileSync(file, 'utf-8');
      const lines = source.split('\n');
      for (const { line, text } of candidates(source)) {
        const trimmed = text.trim();
        if (!trimmed || NEUTRAL.test(trimmed)) continue;
        if (!FRENCH_HINT.test(trimmed)) continue;
        const lineText = lines[line - 1] ?? '';
        if (/^\s*(\/\/|\*|\/\*)/.test(lineText)) continue;
        if (OCCURRENCE_ALLOWLIST.has(`${rel}:${trimmed}`)) continue;
        findings.push({ file: rel, line, text: trimmed });
      }
    }

    const report = findings.slice(0, 80).map((finding) => `${finding.file}:${finding.line} → ${finding.text.slice(0, 120)}`);
    expect(findings, `hardcoded French copy found (${findings.length}):\n${report.join('\n')}`).toEqual([]);
  });
});
