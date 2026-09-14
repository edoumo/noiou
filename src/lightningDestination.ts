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
  if (!value) return { kind: 'UNKNOWN', value: '', reusable: false, label: 'Destination vide' };

  if (/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/i.test(value)) {
    return { kind: 'LIGHTNING_ADDRESS', value, reusable: true, label: 'Lightning Address' };
  }

  if (/^lno1[0-9a-z]+$/i.test(value)) {
    return { kind: 'BOLT12_OFFER', value, reusable: true, label: 'Offre BOLT12' };
  }

  if (/^lnurl1[0-9a-z]+$/i.test(value)) {
    return { kind: 'LNURL', value, reusable: true, label: 'LNURL' };
  }

  if (/^ln(?:bc|tb|bcrt)[0-9a-z]+$/i.test(value)) {
    return { kind: 'BOLT11_INVOICE', value, reusable: false, label: 'Invoice BOLT11' };
  }

  return { kind: 'UNKNOWN', value, reusable: false, label: 'Format Lightning inconnu' };
}

export function normalizeReusableLightningDestination(input: string): string {
  const parsed = parseLightningDestination(input);
  if (parsed.kind === 'BOLT11_INVOICE') {
    throw new Error('Une invoice BOLT11 est ponctuelle et peut expirer. Utilise une Lightning Address, une offre BOLT12 (par ex. Phoenix) ou un LNURL réutilisable.');
  }
  if (!parsed.reusable) {
    throw new Error('Destination Lightning non reconnue. Formats acceptés : adresse user@domain, offre BOLT12 lno1… ou LNURL.');
  }
  return parsed.value;
}

export function lightningDestinationLabel(input: string): string {
  return parseLightningDestination(input).label;
}
