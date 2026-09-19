# Internationalization and interaction feedback

NOIOU ships a real, fully embedded internationalization layer: every language the
selector offers translates the whole interface, with no runtime network call and
no fallback to French.

## Architecture

```
src/i18n/
  index.ts          engine: t(), interpolate(), locale-aware formatters
  types.ts          Catalog / LocaleCode / TranslationParams types
  locales.ts        REGISTERED_LOCALES + PUBLIC_LOCALES + resolution rules
  provider.tsx      I18nProvider / useI18n() (React context, persistence, <html lang>)
  catalogs/
    index.ts        static registry of embedded catalogs
    fr-FR.ts        REFERENCE catalog — the single source of truth for the key set
    en-GB.ts …      one file per public locale
```

### Two explicit notions

- **`REGISTERED_LOCALES`** — the 32 languages the project knows about. Registering a
  locale only makes it a *candidate*; it is never shown to a user by itself.
- **`PUBLIC_LOCALES`** — the locales whose catalog is complete (same key set as
  `fr-FR`, no empty string, identical named placeholders) AND whose rendering has
  been verified. The selector offers exactly these, and `effectiveLocale()` refuses
  anything else.

**Rule: an incomplete language must never be visible in production.** A stored
preference pointing at a registered-only locale resolves to the default (`fr-FR`)
rather than rendering a half-translated interface.

### API

```tsx
const { t, locale, formatAmount, formatNumber } = useI18n();

t('game.create');
t('dialog.rebuy.message', { amount: '20,00 €', player: 'Alice' });
formatAmount(20, 'EUR');   // locale-aware, never changes the value
```

Pure modules (validators, Lightning helpers, parsers) import `t` from `src/i18n`
directly: `I18nProvider` mirrors the active locale into the engine so an error
raised outside React still follows the selected language.

### Offline by construction

Catalogs are static TypeScript imports, bundled at build time. There is no
translation API, no fetch, no service worker cache dependency: switching language
works with the device fully offline.

## Formatting

Dates, times, numbers and currencies go through the selected locale:
`Intl.NumberFormat`, `Intl.DateTimeFormat` and `toLocaleTimeString`. Only the
*display* changes — amounts, sats values and ledger payloads are never touched.

SATS render as `<grouped number> sats` in every locale (the unit is not a currency
code); EUR/USD use the locale's own currency rules.

## Gates (CI)

Two automated gates protect the invariant:

1. **Catalog gate** — `src/i18n/catalogs.test.ts`. For every public locale: same keys
   as the reference, no empty value, identical placeholders, and no key left
   identical to the French source. It also asserts that a registered-only locale has
   no embedded catalog, so it can never be activated.
2. **Hardcoded-string gate** — `src/i18n/hardcoded-strings.test.ts`. Scans `src/` for
   French user-facing sentences still written in components. Technical vocabulary
   (Bitcoin, Lightning, NWC, BOLT11, BOLT12, LNURL, SHA-256, QR, sats), CSS classes,
   storage keys and identifiers are tolerated; the tolerated occurrences are listed
   one by one in the gate's allowlist with a justification.

## Terminology (French)

`recave (rebuy)` is used in explanatory and first-use zones; short UI contexts use
`recave`. The raw word `rebuy` never stands alone in the French interface. Data
structures and enums (`REBUY`, `rebuyAmount`, `rebuyEnabled`) are NOT renamed — the
translation layer never touches the domain model.

## Haptics and sounds

All feedback is optional and disabled by default.

Preferences are stored in local browser storage under `noiou.preferences.v1`:

- vibration on button press;
- ordinary button click sound;
- stronger two-tone feedback for financial actions (buy-in/rebuy/receipt/settlement).

The financial-action classification matches a button label against the localized
labels of every financial button in every embedded catalog, so it keeps working in
all languages; a legacy term-based pattern is kept so historical labels still
classify after an upgrade.

No audio asset, telemetry call or backend is used. Sounds are synthesized locally
with Web Audio after a user gesture.

## Storage keys

- `noiou.preferences.v1` — locale + haptics/sound toggles (legacy payload, still read);
- `noiou.locale.v1` — active locale written by `I18nProvider` on selection.

Both are local-only. No wallet secret, URI or seed is ever stored.

## Accessibility and safety

- sound and vibration are opt-in;
- visual state remains authoritative; feedback never changes accounting state;
- unsupported browsers skip unavailable haptics/audio capabilities;
- the flag is only a visual aid: every option also shows the native language name;
- `<html lang>` follows the active locale for screen readers and hyphenation.
