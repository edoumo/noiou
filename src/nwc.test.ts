import { describe, expect, it } from 'vitest';
import { assertSafeNwcPolicy, parseNwcUri, redactNwcDescriptor, SAFE_NWC_POLICY } from './nwc';

const pubkey = 'a'.repeat(64);
const secret = 'b'.repeat(64);

describe('NWC safety boundary', () => {
  it('parses a secure local-only connection descriptor', () => {
    const descriptor = parseNwcUri(`nostr+walletconnect://${pubkey}?relay=${encodeURIComponent('wss://relay.example')}&secret=${secret}&lud16=alice%40example.com`);
    expect(descriptor.walletPubkey).toBe(pubkey);
    expect(descriptor.relays).toEqual(['wss://relay.example']);
    expect(descriptor.secret).toBe(secret);
    expect(redactNwcDescriptor(descriptor).secret).toBe('[REDACTED]');
  });

  it('rejects insecure relay URLs', () => {
    expect(() => parseNwcUri(`nostr+walletconnect://${pubkey}?relay=${encodeURIComponent('ws://relay.example')}&secret=${secret}`)).toThrow(/secure wss/i);
  });

  it('keeps live outgoing payments disabled', () => {
    expect(() => assertSafeNwcPolicy(SAFE_NWC_POLICY)).not.toThrow();
    expect(() => assertSafeNwcPolicy({ ...SAFE_NWC_POLICY, allowOutgoingPayments: true })).toThrow(/disabled/i);
  });
});
