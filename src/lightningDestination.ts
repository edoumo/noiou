import { t } from './i18n';

export type LightningDestinationKind = 'LIGHTNING_ADDRESS' | 'BOLT12_OFFER' | 'BOLT11_INVOICE' | 'LNURL' | 'UNKNOWN';

export interface ParsedLightningDestination {
  kind: LightningDestinationKind;
  value: string;
  reusable: boolean;
  label: string;
}

function unwrapLightningPayload(input: string): string {
  let value = input.trim();
  if (!value) return '';

  if (/^lightning:/i.test(value)) {
    value = value.replace(/^lightning:/i, '');
    try { value = decodeURIComponent(value); } catch { /* keep original payload */ }
    return value.trim();
  }

  if (/^bitcoin:/i.test(value)) {
    const queryIndex = value.indexOf('?');
    if (queryIndex >= 0) {
      const params = new URLSearchParams(value.slice(queryIndex + 1));
      const embedded = params.get('lightning') ?? params.get('lno') ?? params.get('lnurl');
      if (embedded) {
        try { return decodeURIComponent(embedded).trim(); } catch { return embedded.trim(); }
      }
    }
  }

  return value;
}

export function parseLightningDestination(input: string): ParsedLightningDestination {
  const value = unwrapLightningPayload(input);
  if (!value) return { kind: 'UNKNOWN', value: '', reusable: false, label: t('destKind.empty') };

  if (/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/i.test(value)) {
    return { kind: 'LIGHTNING_ADDRESS', value, reusable: true, label: t('destKind.lightningAddress') };
  }

  if (/^lno1[0-9a-z]+$/i.test(value)) {
    return { kind: 'BOLT12_OFFER', value, reusable: true, label: t('destKind.bolt12') };
  }

  if (/^lnurl1[0-9a-z]+$/i.test(value)) {
    return { kind: 'LNURL', value, reusable: true, label: t('destKind.lnurl') };
  }

  if (/^ln(?:bc|tb|bcrt)[0-9a-z]+$/i.test(value)) {
    return { kind: 'BOLT11_INVOICE', value, reusable: false, label: t('destKind.bolt11') };
  }

  return { kind: 'UNKNOWN', value, reusable: false, label: t('destKind.unknown') };
}

export function normalizeReusableLightningDestination(input: string): string {
  const parsed = parseLightningDestination(input);
  if (parsed.kind === 'BOLT11_INVOICE') {
    throw new Error(t('error.bolt11Spot'));
  }
  if (!parsed.reusable) {
    throw new Error(t('error.destinationUnknown'));
  }
  return parsed.value;
}

export function lightningDestinationLabel(input: string): string {
  return parseLightningDestination(input).label;
}
