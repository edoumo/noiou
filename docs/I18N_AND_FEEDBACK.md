# Internationalization and interaction feedback foundation

This alpha introduces a persistent local preference layer before translating the full application.

## Language registry

NOIOU now has an explicit locale registry covering the current Mailcow-style baseline plus Croatian, which was requested explicitly for NOIOU. The registry is intentionally independent from React copy so future catalogs can be added without changing domain/accounting logic.

Current registered locales:

- Bulgarian, Czech, Danish, German, English, Spanish, Finnish, French, Greek, Croatian, Hungarian, Italian
- Japanese, Korean, Latvian, Lithuanian, Norwegian, Dutch, Polish
- Portuguese (Portugal and Brazil), Romanian, Russian, Slovenian, Slovak, Swedish, Turkish
- Ukrainian, Uzbek, Vietnamese, Simplified Chinese, Traditional Chinese

During the private alpha the main application copy remains predominantly French. The selector persists the preferred locale and updates the document language immediately; full catalogs will be filled after workflow stabilization.

## Haptics and sounds

All feedback is optional and disabled by default.

Preferences are stored only in local browser storage under `noiou.preferences.v1`:

- vibration on button press;
- ordinary button click sound;
- stronger two-tone feedback for financial-looking actions such as buy-in/rebuy/receipt/settlement.

No audio asset, telemetry call or backend is used. Sounds are synthesized locally with Web Audio after a user gesture. Vibration uses the browser vibration capability when available.

The current financial-action classification is intentionally a UI-only alpha heuristic based on button labels. Before public release, critical accounting actions should move to explicit semantic action metadata rather than label matching.

## Accessibility and safety

- sound and vibration are opt-in;
- visual state remains authoritative; feedback never changes accounting state;
- unsupported browsers simply skip unavailable haptics/audio capabilities;
- the language flag is only a visual aid: every option also displays the native language name.
