import { describe, expect, it } from 'vitest';
import { buildManualLightningReceiptReference, isManualLightningReceiptReference } from './manualLightningReceipt';

describe('manual Lightning receipt references', () => {
  it('creates a namespaced reference', () => {
    const reference = buildManualLightningReceiptReference('abc');
    expect(reference).toBe('manual-lightning:abc');
    expect(isManualLightningReceiptReference(reference)).toBe(true);
  });

  it('rejects unrelated references', () => {
    expect(isManualLightningReceiptReference('invoice-123')).toBe(false);
    expect(isManualLightningReceiptReference(undefined)).toBe(false);
  });
});
