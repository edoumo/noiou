import { describe, expect, it } from 'vitest';
import {
  assertReceiveModeAllowed,
  availableReceiveModes,
  defaultReceiveMode,
  nwcRuntimeStateLabel,
  receiveModeLabel,
  resolveRuntimeFlags,
} from './runtimeMode';

describe('runtime flags', () => {
  it('disables mock payments in a production build', () => {
    expect(resolveRuntimeFlags({ PROD: true }).allowMockPayments).toBe(false);
  });

  it('keeps mock payments available in development/test builds', () => {
    expect(resolveRuntimeFlags({ PROD: false }).allowMockPayments).toBe(true);
  });
});

describe('available receive modes', () => {
  it('never offers the mock mode in production', () => {
    expect(availableReceiveModes(false)).toEqual(['NWC_RECEIVE_ONLY', 'EXTERNAL_WALLET_MANUAL']);
    expect(availableReceiveModes(false)).not.toContain('MOCK');
  });

  it('keeps the mock mode first-class in dev/test builds', () => {
    expect(availableReceiveModes(true)).toEqual(['NWC_RECEIVE_ONLY', 'EXTERNAL_WALLET_MANUAL', 'MOCK']);
  });
});

describe('safe default receive mode', () => {
  it('defaults to NWC automatic only when the wallet is connected', () => {
    expect(defaultReceiveMode(true)).toBe('NWC_RECEIVE_ONLY');
  });

  it('defaults to the external/manual wallet otherwise — never mock', () => {
    expect(defaultReceiveMode(false)).toBe('EXTERNAL_WALLET_MANUAL');
    expect(defaultReceiveMode(false)).not.toBe('MOCK');
  });
});

describe('receive mode runtime guard', () => {
  it('blocks mock in production even when the mode is injected explicitly', () => {
    expect(() => assertReceiveModeAllowed('MOCK', false)).toThrow(/désactivé/i);
  });

  it('allows mock only in dev/test builds', () => {
    expect(() => assertReceiveModeAllowed('MOCK', true)).not.toThrow();
  });

  it('always allows the two real flows', () => {
    for (const allow of [true, false]) {
      expect(() => assertReceiveModeAllowed('NWC_RECEIVE_ONLY', allow)).not.toThrow();
      expect(() => assertReceiveModeAllowed('EXTERNAL_WALLET_MANUAL', allow)).not.toThrow();
    }
  });

  it('rejects unknown modes outright', () => {
    expect(() => assertReceiveModeAllowed('SOMETHING_ELSE', true)).toThrow(/inconnu/i);
  });
});

describe('labels', () => {
  it('shows the mock label only in dev/test builds', () => {
    expect(receiveModeLabel('MOCK', true)).toBe('Mock / test (dev)');
    expect(receiveModeLabel('MOCK', false)).toBe('Indisponible');
  });

  it('never leaks the word mock through the NWC state badge in production', () => {
    expect(nwcRuntimeStateLabel('MOCK', false)).toBe('MANUEL');
    expect(nwcRuntimeStateLabel('LIVE_ARMED', false)).toBe('NWC RÉEL');
    expect(nwcRuntimeStateLabel('RECONNECT_REQUIRED', false)).toBe('RECONNECTER');
    expect(nwcRuntimeStateLabel('DIAGNOSTIC', false)).toBe('DIAGNOSTIC');
  });
});
