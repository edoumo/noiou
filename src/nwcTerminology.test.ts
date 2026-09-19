/**
 * NWC terminology + permission invariants (NOIOU).
 *
 * The mandate §3/§6/§35: the *labels* change (NWC — encaissement automatique /
 * Wallet externe — encaissement manuel) but the permission surface must not
 * move by a single method. `get_info`, `make_invoice` and `lookup_invoice` stay
 * allowed; `pay_invoice` and `pay_keysend` stay forbidden — no outgoing
 * automatic payment, ever.
 */
import { describe, expect, it } from 'vitest';
import { frFRCatalog } from './i18n/catalogs/fr-FR';
import { catalogs } from './i18n/catalogs';
import { PUBLIC_LOCALE_CODES } from './i18n/locales';
import { assertReceiveOnlyNwcMethods } from './nwcReceive';
import { assertSafeNwcPolicy, SAFE_NWC_POLICY } from './nwc';

const ALLOWED_METHODS = ['get_info', 'make_invoice', 'lookup_invoice'];
const FORBIDDEN_METHODS = ['pay_invoice', 'pay_keysend'];

describe('NWC permission invariants', () => {
  it('allows exactly get_info, make_invoice and lookup_invoice', () => {
    expect(() => assertReceiveOnlyNwcMethods(ALLOWED_METHODS)).not.toThrow();
    // Each required method is individually sufficient to satisfy its own check.
    expect(() => assertReceiveOnlyNwcMethods(['get_info'])).toThrow(/make_invoice/);
    expect(() => assertReceiveOnlyNwcMethods(['get_info', 'make_invoice'])).toThrow(/lookup_invoice/);
    expect(() => assertReceiveOnlyNwcMethods(['GET_INFO', 'MAKE_INVOICE', 'LOOKUP_INVOICE'])).not.toThrow();
  });

  it('forbids pay_invoice', () => {
    expect(() => assertReceiveOnlyNwcMethods([...ALLOWED_METHODS, 'pay_invoice'])).toThrow(/pay_invoice/);
  });

  it('forbids pay_keysend', () => {
    expect(() => assertReceiveOnlyNwcMethods([...ALLOWED_METHODS, 'pay_keysend'])).toThrow(/pay_keysend/);
  });

  it('forbids both outgoing methods at once', () => {
    expect(() => assertReceiveOnlyNwcMethods([...ALLOWED_METHODS, ...FORBIDDEN_METHODS])).toThrow();
  });

  it('keeps the static policy non-custodial (no outgoing, interactive confirmation)', () => {
    expect(SAFE_NWC_POLICY.allowInvoiceCreation).toBe(true);
    expect(SAFE_NWC_POLICY.allowInvoiceLookup).toBe(true);
    expect(SAFE_NWC_POLICY.allowOutgoingPayments).toBe(false);
    expect(SAFE_NWC_POLICY.requireInteractiveConfirmation).toBe(true);
    expect(() => assertSafeNwcPolicy(SAFE_NWC_POLICY)).not.toThrow();
  });
});

describe('NWC / external-wallet wording', () => {
  const modes = ['NWC — encaissement automatique', 'Wallet externe — encaissement manuel'];

  it('uses the mandated French labels', () => {
    expect(frFRCatalog['receiveMode.nwcAuto']).toBe(modes[0]);
    expect(frFRCatalog['receiveMode.external']).toBe(modes[1]);
  });

  it('explains automatic collection for NWC', () => {
    const body = frFRCatalog['lightning.mode.nwc.body'];
    expect(body).toContain('vérifie automatiquement');
    expect(body).toContain('caves et recaves');
    expect(body).toContain('wallet de l’organisateur');
  });

  it('explains that outgoing settlements stay manual', () => {
    const nwcBody = frFRCatalog['lightning.mode.nwc.body'];
    const externalBody = frFRCatalog['lightning.mode.external.body'];
    expect(nwcBody).toContain('règlements sortants restent à effectuer par l’organisateur');
    expect(externalBody).toContain('restent également à effectuer manuellement par l’organisateur');
  });

  it('states once, unambiguously, that NOIOU never spends', () => {
    expect(frFRCatalog['lightning.mode.nwc.body']).toContain('NOIOU ne dépense jamais à sa place');
    expect(frFRCatalog['lightning.outgoing.manual']).toContain('aucune permission de dépense');
  });

  it('explains manual confirmation for the external wallet', () => {
    const body = frFRCatalog['lightning.mode.external.body'];
    expect(body).toContain('vérifie et confirme lui-même les encaissements');
  });

  it('never uses the retired labels as a primary UI string', () => {
    const retired = ['NWC réception uniquement', 'NWC automatique', 'NWC receive-only'];
    for (const code of PUBLIC_LOCALE_CODES) {
      const catalog = catalogs[code];
      if (!catalog) continue;
      for (const [key, value] of Object.entries(catalog)) {
        // The raw technical word may stay in diagnostics/technical copy, but
        // never as the whole label of a receive mode.
        if (!key.startsWith('receiveMode.') && !key.startsWith('lightning.mode.')) continue;
        for (const phrase of retired) {
          expect(value === phrase, `${code} ${key} still uses "${phrase}"`).toBe(false);
        }
      }
    }
  });
});
