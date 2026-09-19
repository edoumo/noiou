/**
 * Minimal first-party telemetry for the official NOIOU deployment.
 *
 * Privacy boundary:
 * - no cookie / localStorage / session id / fingerprint;
 * - no player, game, amount, invoice, payment hash, wallet or NWC data;
 * - only an allow-listed generic event + pathname + active locale + coarse
 *   viewport class are sent;
 * - the MITC dashboard stores aggregate counters only, never raw events.
 *
 * Self-hosted builds may simply remove/override this module; it contains no
 * credential and no analytics SDK.
 */

export type AppTelemetryEvent =
  | 'app_open'
  | 'game_created'
  | 'game_started'
  | 'game_closed'
  | 'receive_mode_nwc'
  | 'receive_mode_manual'
  | 'join_qr_used'
  | 'technical_error';

export interface AppTelemetryPayload {
  v: 1;
  site_id: 'noiou-app';
  event: AppTelemetryEvent;
  path: string;
  locale: string;
  device: 'mobile' | 'tablet' | 'desktop' | 'unknown';
}

const ENDPOINT = 'https://dashboard.mitc.fr/v1/analytics/events';

function coarseDevice(width: number | undefined): AppTelemetryPayload['device'] {
  if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) return 'unknown';
  if (width <= 640) return 'mobile';
  if (width <= 1024) return 'tablet';
  return 'desktop';
}

function cleanLocale(locale: string | undefined): string {
  const value = String(locale || 'fr-FR').trim();
  return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(value) ? value : 'fr-FR';
}

function cleanPath(path: string | undefined): string {
  const value = String(path || '/');
  if (!value.startsWith('/') || value.includes('?') || value.includes('#') || value.length > 160) return '/';
  return value;
}

export function buildAppTelemetryPayload(
  event: AppTelemetryEvent,
  locale?: string,
  env?: { path?: string; width?: number },
): AppTelemetryPayload {
  const path = env?.path ?? (typeof window !== 'undefined' ? window.location.pathname : '/');
  const width = env?.width ?? (typeof window !== 'undefined' ? window.innerWidth : undefined);
  const activeLocale = locale ?? (typeof document !== 'undefined' ? document.documentElement.lang : 'fr-FR');
  return {
    v: 1,
    site_id: 'noiou-app',
    event,
    path: cleanPath(path),
    locale: cleanLocale(activeLocale),
    device: coarseDevice(width),
  };
}

export function sendAppTelemetry(event: AppTelemetryEvent, locale?: string): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  // HP/dev/local instances must never pollute production usage statistics.
  if (window.location.origin !== 'https://app.noiou.io') return;

  const body = JSON.stringify(buildAppTelemetryPayload(event, locale));
  try {
    if (typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
      if (navigator.sendBeacon(ENDPOINT, blob)) return;
    }
  } catch {
    // fall through to best-effort fetch
  }

  try {
    void fetch(ENDPOINT, {
      method: 'POST',
      mode: 'no-cors',
      keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body,
    }).catch(() => undefined);
  } catch {
    // Telemetry must never alter the product flow.
  }
}
