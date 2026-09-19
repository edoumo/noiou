import type { ContributionKind } from './domain';
import type { LightningInvoice } from './lightning';
import { parseLightningDestination } from './lightningDestination';
import { requestExactInvoiceFromReusableDestination } from './lnurlPay';
import { t } from './i18n';
import { buildManualExternalReference } from './manualExternalLightning';

export function shortGameReference(gameId: string): string {
  return gameId.replace(/-/g, '').slice(0, 8).toUpperCase();
}

function cleanLabel(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 32);
}

export function buildTraceLabel(gameId: string, nickname: string, action: string): string {
  return `NOIOU ${shortGameReference(gameId)} · ${cleanLabel(nickname)} · ${cleanLabel(action)}`;
}

export function buildPaymentTrace(gameId: string, nickname: string, kind: ContributionKind, ordinal = 1): string {
  return buildTraceLabel(gameId, nickname, kind === 'BUYIN' ? t('kind.buyin') : `${t('kind.rebuy')} ${ordinal}`);
}

export async function prepareExternalIncomingRequest(
  organizerDestination: string | undefined,
  sats: number,
  traceLabel: string,
): Promise<LightningInvoice> {
  const reference = buildManualExternalReference();
  const base: LightningInvoice = {
    id: reference,
    request: '',
    sats,
    status: 'PENDING',
    source: 'MANUAL_EXTERNAL',
    traceLabel,
  };

  if (!organizerDestination?.trim()) {
    return {
      ...base,
      preparationError: t('error.noReusableDestination', { sats: `${sats.toLocaleString('fr-FR')} sats` }),
    };
  }

  const parsed = parseLightningDestination(organizerDestination);
  if (parsed.kind === 'BOLT12_OFFER') {
    return {
      ...base,
      preparationError: t('error.bolt12NoInvoice', { sats: `${sats.toLocaleString('fr-FR')} sats` }),
    };
  }

  if (parsed.kind !== 'LIGHTNING_ADDRESS' && parsed.kind !== 'LNURL') {
    return {
      ...base,
      preparationError: t('error.destinationNotUsable', { label: parsed.label, sats: `${sats.toLocaleString('fr-FR')} sats` }),
    };
  }

  try {
    const result = await requestExactInvoiceFromReusableDestination(parsed.value, sats, traceLabel);
    return {
      ...base,
      request: result.invoice,
      preparedBy: 'LNURL_PAY',
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ...base,
      preparationError: detail,
    };
  }
}
