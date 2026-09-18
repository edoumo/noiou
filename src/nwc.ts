import { t } from './i18n';

export interface NwcConnectionDescriptor {
  walletPubkey: string;
  relays: string[];
  secret: string;
  lud16?: string;
}

export interface NwcPermissionPolicy {
  allowInvoiceCreation: boolean;
  allowInvoiceLookup: boolean;
  allowOutgoingPayments: boolean;
  requireInteractiveConfirmation: boolean;
}

export const SAFE_NWC_POLICY: NwcPermissionPolicy = {
  allowInvoiceCreation: true,
  allowInvoiceLookup: true,
  allowOutgoingPayments: false,
  requireInteractiveConfirmation: true,
};

const HEX_64 = /^[0-9a-f]{64}$/i;

export function parseNwcUri(uri: string): NwcConnectionDescriptor {
  const value = uri.trim();
  if (!value.startsWith('nostr+walletconnect://')) throw new Error(t('error.nwcUriScheme'));
  const url = new URL(value);
  const walletPubkey = url.hostname || url.pathname.replace(/^\/+/, '');
  const secret = url.searchParams.get('secret') ?? '';
  const relays = url.searchParams.getAll('relay');
  const lud16 = url.searchParams.get('lud16') ?? undefined;

  if (!HEX_64.test(walletPubkey)) throw new Error(t('error.nwcPubkey'));
  if (!HEX_64.test(secret)) throw new Error(t('error.nwcSecret'));
  if (relays.length === 0 || relays.some((relay) => !/^wss:\/\//i.test(relay))) throw new Error(t('error.nwcRelayRequired'));

  return { walletPubkey, relays, secret, lud16 };
}

export function assertSafeNwcPolicy(policy: NwcPermissionPolicy): void {
  if (!policy.allowInvoiceCreation || !policy.allowInvoiceLookup) throw new Error(t('error.nwcCapabilities'));
  if (policy.allowOutgoingPayments) throw new Error(t('error.nwcOutgoingDisabled'));
  if (!policy.requireInteractiveConfirmation) throw new Error(t('error.nwcConfirmationMandatory'));
}

export function redactNwcDescriptor(descriptor: NwcConnectionDescriptor) {
  return {
    walletPubkey: descriptor.walletPubkey,
    relays: descriptor.relays,
    lud16: descriptor.lud16,
    secret: '[REDACTED]',
  };
}
