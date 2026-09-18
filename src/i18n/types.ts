/**
 * Core i18n types (NOIOU).
 *
 * Translation keys are derived from the French reference catalog: the `fr-FR`
 * catalog is the single source of truth for the key set. Every public locale
 * must provide an exhaustive `Record<TranslationKey, string>` — TypeScript
 * enforces exhaustivity at build time and the catalog gate test enforces it
 * again at CI time (missing keys, empty strings, placeholder mismatch).
 */

/** Values usable as interpolation parameters in `t(key, params)`. */
export type TranslationParams = Record<string, string | number>;

/** A locale code known to the registry (e.g. `fr-FR`). */
export type LocaleCode = string;

/**
 * Shape of a locale catalog: a flat map of dotted keys to strings.
 * Placeholders use named braces, e.g. `Confirmer la recave de {amount} pour {player} ?`
 */
export type Catalog = Record<string, string>;

/** Metadata for one locale entry in the registry. */
export interface LocaleDescriptor {
  /** BCP-47 code used for `Intl` formatting and `document.lang`. */
  readonly code: LocaleCode;
  /** Flag emoji shown in the language selector. */
  readonly flag: string;
  /** Endonym shown in the language selector. */
  readonly name: string;
}
