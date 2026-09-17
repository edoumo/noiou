import type { LightningReceiveMode } from './domain';

export interface RuntimeFlags {
  /**
   * True only when the app is explicitly served by a development server or an automated test
   * environment. The mock Lightning mode is a development/test tool: a production build must
   * never offer it, otherwise an organizer could believe a cave was really received while a
   * fictional backend was active. Production builds therefore always disable it.
   */
  allowMockPayments: boolean;
}

export function resolveRuntimeFlags(env: { PROD: boolean }): RuntimeFlags {
  return { allowMockPayments: !env.PROD };
}

/**
 * Resolved once from the Vite build environment:
 * - `vite dev` (development) and vitest (test) keep the mock available;
 * - `vite build` (production) disables it for good — there is no override flag in production.
 */
export const RUNTIME: RuntimeFlags = resolveRuntimeFlags(import.meta.env);

export function availableReceiveModes(allowMockPayments: boolean): LightningReceiveMode[] {
  return allowMockPayments
    ? ['NWC_RECEIVE_ONLY', 'EXTERNAL_WALLET_MANUAL', 'MOCK']
    : ['NWC_RECEIVE_ONLY', 'EXTERNAL_WALLET_MANUAL'];
}

export function defaultReceiveMode(nwcConnected: boolean): LightningReceiveMode {
  return nwcConnected ? 'NWC_RECEIVE_ONLY' : 'EXTERNAL_WALLET_MANUAL';
}

/**
 * Runtime guard for the receive mode actually used to create or check a Lightning request.
 * Mirrors the product rule: no fictional payment path may ever be reachable in production,
 * even if a mode value is injected directly into the app state or a forged session.
 */
export function assertReceiveModeAllowed(mode: LightningReceiveMode | string, allowMockPayments: boolean): void {
  if (mode === 'MOCK') {
    if (!allowMockPayments) {
      throw new Error('L’encaissement fictif est désactivé dans cette version : choisis « NWC automatique » ou « Wallet externe manuel ». Aucune cave fictive ne peut être encaissée ici.');
    }
    return;
  }
  if (mode !== 'NWC_RECEIVE_ONLY' && mode !== 'EXTERNAL_WALLET_MANUAL') {
    throw new Error('Mode de réception Lightning inconnu : demande refusée.');
  }
}

export function receiveModeLabel(mode: LightningReceiveMode, allowMockPayments: boolean): string {
  if (mode === 'NWC_RECEIVE_ONLY') return 'NWC automatique';
  if (mode === 'EXTERNAL_WALLET_MANUAL') return 'Wallet externe manuel';
  // The dev-only label is gated on the static DEV flag so the production bundle never
  // contains mock-facing copy at all (not merely hidden at runtime).
  if (import.meta.env.DEV && allowMockPayments) return 'Mock / test (dev)';
  return 'Indisponible';
}

export function nwcRuntimeStateLabel(nwcMode: string, allowMockPayments: boolean): string {
  if (nwcMode === 'LIVE_ARMED') return 'NWC RÉEL';
  if (nwcMode === 'RECONNECT_REQUIRED') return 'RECONNECTER';
  if (nwcMode === 'DIAGNOSTIC') return 'DIAGNOSTIC';
  return allowMockPayments ? 'MOCK' : 'MANUEL';
}
