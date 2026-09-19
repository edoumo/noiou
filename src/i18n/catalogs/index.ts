/**
 * Catalog registry (NOIOU).
 *
 * Every PUBLIC locale imports its fully translated catalog here. Catalogs are
 * static imports so they are embedded in the bundle: no network fetch, fully
 * offline, no runtime translation service.
 *
 * A locale whose catalog is missing here is simply not offered by the selector
 * (`effectiveLocale` also refuses it) — that is the hard gate that keeps an
 * incomplete language out of production.
 */
import type { Catalog } from '../types';
import { bg_BG } from './bg-BG';
import { da_DK } from './da-DK';
import { de_DE } from './de-DE';
import { el_GR } from './el-GR';
import { en_GB } from './en-GB';
import { en_US } from './en-US';
import { es_ES } from './es-ES';
import { fi_FI } from './fi-FI';
import { frFRCatalog } from './fr-FR';
import { hr_HR } from './hr-HR';
import { hu_HU } from './hu-HU';
import { it_IT } from './it-IT';
import { ja_JP } from './ja-JP';
import { ko_KR } from './ko-KR';
import { pt_PT } from './pt-PT';

export const catalogs: Record<string, Catalog> = {
  'fr-FR': frFRCatalog,
  'en-GB': en_GB,
  'en-US': en_US,
  'de-DE': de_DE,
  'es-ES': es_ES,
  'it-IT': it_IT,
  'pt-PT': pt_PT,
  'da-DK': da_DK,
  'hr-HR': hr_HR,
  'bg-BG': bg_BG,
  'el-GR': el_GR,
  'fi-FI': fi_FI,
  'hu-HU': hu_HU,
  'ja-JP': ja_JP,
  'ko-KR': ko_KR,
};

export { frFRCatalog };
