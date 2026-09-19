import { describe, expect, it } from 'vitest';
import { buildAppTelemetryPayload } from './telemetry';

describe('privacy telemetry payload', () => {
  it('contains only the allow-listed aggregate dimensions', () => {
    const payload = buildAppTelemetryPayload('game_created', 'fr-FR', { path: '/table', width: 390 });
    expect(payload).toEqual({
      v: 1,
      site_id: 'noiou-app',
      event: 'game_created',
      path: '/table',
      locale: 'fr-FR',
      device: 'mobile',
    });
    expect(Object.keys(payload).sort()).toEqual(['device', 'event', 'locale', 'path', 'site_id', 'v']);
  });

  it('never carries business or wallet content', () => {
    const raw = JSON.stringify(buildAppTelemetryPayload('receive_mode_nwc', 'en-US', { path: '/', width: 1280 }));
    for (const forbidden of ['amount', 'player', 'nickname', 'gameId', 'invoice', 'payment_hash', 'preimage', 'wallet', 'nwc_secret']) {
      expect(raw).not.toContain(forbidden);
    }
  });

  it('coarsens device dimensions and sanitizes path/locale', () => {
    expect(buildAppTelemetryPayload('app_open', 'bad locale', { path: '/?secret=x', width: 800 })).toMatchObject({
      path: '/',
      locale: 'fr-FR',
      device: 'tablet',
    });
  });
});
