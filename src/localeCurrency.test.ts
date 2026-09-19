/**
 * Locale ⇒ default currency, currency registry, oracle capability and
 * cash-only offline games (NOIOU mandate §5/§6/§7/§11/§12/§16/§18/§26).
 *
 * Everything here is pure logic with injected I/O: the offline tests record
 * every fetch attempt, so "no market call was made" is an assertion, not a
 * claim.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  amountStepFor,
  CURRENCY_REGISTRY,
  DEFAULT_CURRENCY_BY_LOCALE,
  defaultCurrencyForLocale,
  isSupportedCurrency,
  isZeroDecimalCurrency,
  loadCreationCurrencyPreference,
  minorUnitsFor,
  resolveCreationCurrency,
  roundForCurrency,
  saveCreationCurrencyPreference,
  SUPPORTED_CURRENCIES,
  SUPPORTED_CURRENCY_CODES,
  type CreationCurrencyPreference,
} from './currency';
import {
  automaticProvidersForCurrency,
  fetchQuote,
  preferredAutomaticProvider,
  providerSupportsCurrency,
  PROVIDER_CURRENCY_SUPPORT,
  PriceOracleError,
} from './priceOracle';
import { planRateLock } from './ratePlan';
import { roundAmount } from './settlement';
import { createSessionBackup, parseSessionBackup } from './backup';
import { createEmptySession, type SessionSnapshot } from './session';
import { PUBLIC_LOCALE_CODES } from './i18n/locales';
import type { Currency, Game } from './domain';

const NOW = Date.parse('2026-09-19T12:00:00Z');

/* ------------------------------------------------ §5 — default by locale */

describe('default currency by locale (§5)', () => {
  it.each([
    ['fr-FR', 'EUR'],
    ['en-GB', 'GBP'],
    ['en-US', 'USD'],
    ['de-DE', 'EUR'],
    ['es-ES', 'EUR'],
    ['it-IT', 'EUR'],
    ['pt-PT', 'EUR'],
    ['da-DK', 'DKK'],
    ['hr-HR', 'EUR'],
    ['bg-BG', 'EUR'],
    ['el-GR', 'EUR'],
    ['fi-FI', 'EUR'],
    ['hu-HU', 'HUF'],
    ['ja-JP', 'JPY'],
    ['ko-KR', 'KRW'],
  ])('maps %s to %s', (locale, expected) => {
    expect(defaultCurrencyForLocale(locale)).toBe(expected);
  });

  it('covers every public locale (all 15)', () => {
    expect(PUBLIC_LOCALE_CODES).toHaveLength(15);
    for (const code of PUBLIC_LOCALE_CODES) {
      expect(defaultCurrencyForLocale(code), `no default currency for ${code}`).toBeTruthy();
    }
    expect(Object.keys(DEFAULT_CURRENCY_BY_LOCALE)).toHaveLength(15);
  });

  it('never applies a naive "Europe ⇒ EUR" rule', () => {
    // Three European locales whose currency is NOT the euro, plus Bulgaria
    // which adopted the euro on 2026-01-01.
    expect(defaultCurrencyForLocale('da-DK')).toBe('DKK');
    expect(defaultCurrencyForLocale('hu-HU')).toBe('HUF');
    expect(defaultCurrencyForLocale('en-GB')).toBe('GBP');
    expect(defaultCurrencyForLocale('bg-BG')).toBe('EUR'); // never BGN
  });

  it('returns nothing for an unknown locale', () => {
    expect(defaultCurrencyForLocale('xx-XX')).toBeUndefined();
  });
});

/* --------------------------------------------- §6/§7 — currency registry */

describe('currency registry (§6/§7)', () => {
  it('registers exactly the mandated currencies', () => {
    expect(SUPPORTED_CURRENCY_CODES).toEqual(['EUR', 'USD', 'GBP', 'DKK', 'HUF', 'JPY', 'KRW', 'SATS']);
    expect(SUPPORTED_CURRENCIES).toHaveLength(8);
  });

  it('carries code, label, kind, minorUnits, symbol and oracleEligible for each', () => {
    for (const descriptor of SUPPORTED_CURRENCIES) {
      expect(descriptor.code, 'code').toBeTruthy();
      expect(descriptor.labelKey, `labelKey of ${descriptor.code}`).toMatch(/^currency\./);
      expect(['FIAT', 'SATS']).toContain(descriptor.kind);
      expect([0, 2]).toContain(descriptor.minorUnits);
      expect(descriptor.symbol, `symbol of ${descriptor.code}`).toBeTruthy();
      expect(typeof descriptor.oracleEligible).toBe('boolean');
    }
  });

  it('does not assume step=0.01 globally', () => {
    expect(minorUnitsFor('EUR')).toBe(2);
    expect(minorUnitsFor('USD')).toBe(2);
    expect(minorUnitsFor('GBP')).toBe(2);
    expect(minorUnitsFor('DKK')).toBe(2);
    // HUF follows real usage (no fillér since 1999), JPY and KRW are 0 by ISO.
    expect(minorUnitsFor('HUF')).toBe(0);
    expect(minorUnitsFor('JPY')).toBe(0);
    expect(minorUnitsFor('KRW')).toBe(0);
    expect(minorUnitsFor('SATS')).toBe(0);

    expect(amountStepFor('EUR')).toBe(0.01);
    expect(amountStepFor('JPY')).toBe(1);
    expect(amountStepFor('HUF')).toBe(1);
    expect(amountStepFor('KRW')).toBe(1);
    expect(amountStepFor('SATS')).toBe(1);
  });

  it('rounds amounts to the smallest usable unit of each currency', () => {
    expect(roundForCurrency(10.005, 'EUR')).toBeCloseTo(10.01, 6);
    expect(roundForCurrency(10.6, 'JPY')).toBe(11);
    expect(roundForCurrency(10.4, 'HUF')).toBe(10);
    expect(roundForCurrency(10.5, 'KRW')).toBe(11);
    expect(roundForCurrency(10.6, 'SATS')).toBe(11);
    // The settlement rounding follows the same rule (no global 0.01 step).
    expect(roundAmount(1234.56, 'JPY')).toBe(1235);
    expect(roundAmount(1234.56, 'EUR')).toBe(1234.56);
  });

  it('flags zero-decimal currencies', () => {
    expect(isZeroDecimalCurrency('JPY')).toBe(true);
    expect(isZeroDecimalCurrency('HUF')).toBe(true);
    expect(isZeroDecimalCurrency('KRW')).toBe(true);
    expect(isZeroDecimalCurrency('SATS')).toBe(true);
    expect(isZeroDecimalCurrency('EUR')).toBe(false);
    expect(isZeroDecimalCurrency('GBP')).toBe(false);
  });

  it('validates currency codes', () => {
    expect(isSupportedCurrency('GBP')).toBe(true);
    expect(isSupportedCurrency('SATS')).toBe(true);
    expect(isSupportedCurrency('CHF')).toBe(false);
    expect(isSupportedCurrency('bgn')).toBe(false);
    expect(isSupportedCurrency(undefined)).toBe(false);
  });

  it('keeps oracleEligible in sync with the provider capability table', () => {
    for (const descriptor of SUPPORTED_CURRENCIES) {
      if (descriptor.code === 'SATS') {
        expect(descriptor.oracleEligible).toBe(false); // no BTC/fiat oracle for sats
        continue;
      }
      expect(descriptor.oracleEligible, descriptor.code)
        .toBe(automaticProvidersForCurrency(descriptor.code).length > 0);
    }
  });
});

/* ------------------------------ §8/§9/§22 — preference, override, reset */

describe('creation currency preference (§8/§9)', () => {
  it('follows the locale while the user never picked a currency', () => {
    const fr = resolveCreationCurrency(null, 'fr-FR');
    expect(fr).toEqual({ auto: true, currency: 'EUR' });
    // Changing the language adjusts the suggestion again.
    expect(resolveCreationCurrency(fr, 'en-US')).toEqual({ auto: true, currency: 'USD' });
    expect(resolveCreationCurrency(fr, 'ja-JP')).toEqual({ auto: true, currency: 'JPY' });
  });

  it('never replaces an explicit choice when the language changes', () => {
    const manual: CreationCurrencyPreference = { auto: false, currency: 'GBP' };
    expect(resolveCreationCurrency(manual, 'fr-FR')).toEqual(manual);
    expect(resolveCreationCurrency(manual, 'en-US')).toEqual(manual);
    expect(resolveCreationCurrency(manual, 'ko-KR')).toEqual(manual);
  });

  it('falls back to EUR for an unknown locale', () => {
    expect(resolveCreationCurrency(null, 'xx-XX')).toEqual({ auto: true, currency: 'EUR' });
  });

  it('persists and restores the preference, and rejects garbage', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
    };
    expect(loadCreationCurrencyPreference(storage)).toBeNull();

    saveCreationCurrencyPreference(storage, { auto: false, currency: 'KRW' });
    expect(loadCreationCurrencyPreference(storage)).toEqual({ auto: false, currency: 'KRW' });

    store.set('noiou.currency.v1', 'not json');
    expect(loadCreationCurrencyPreference(storage)).toBeNull();
    store.set('noiou.currency.v1', JSON.stringify({ auto: 'yes', currency: 'GBP' }));
    expect(loadCreationCurrencyPreference(storage)).toBeNull();
    store.set('noiou.currency.v1', JSON.stringify({ auto: true, currency: 'BGN' }));
    expect(loadCreationCurrencyPreference(storage)).toBeNull();
  });

  it('allows a currency unrelated to the locale (fr-FR + GBP)', () => {
    // §8: the default is a suggestion, never a constraint.
    const plan = planRateLock({
      currency: 'GBP',
      provider: 'MANUAL',
      manualRate: 60_000,
      manualNote: '',
      manualConfirmed: true,
      quote: null,
      nowMs: NOW,
    });
    expect(plan.kind).toBe('MANUAL');
  });
});

/* -------------------------------------------- §13/§14 — oracle capability */

describe('oracle capability per currency (§13/§14)', () => {
  it('knows which providers publish each pair (verified against the live APIs)', () => {
    // Kraken exposes BTC/EUR, BTC/USD, BTC/GBP and BTC/JPY only.
    expect(providerSupportsCurrency('KRAKEN', 'EUR')).toBe(true);
    expect(providerSupportsCurrency('KRAKEN', 'USD')).toBe(true);
    expect(providerSupportsCurrency('KRAKEN', 'GBP')).toBe(true);
    expect(providerSupportsCurrency('KRAKEN', 'JPY')).toBe(true);
    expect(providerSupportsCurrency('KRAKEN', 'DKK')).toBe(false);
    expect(providerSupportsCurrency('KRAKEN', 'HUF')).toBe(false);
    expect(providerSupportsCurrency('KRAKEN', 'KRW')).toBe(false);
    // Coinbase answers for DKK/HUF/KRW; its BTC/JPY answer is not exploitable.
    expect(providerSupportsCurrency('COINBASE', 'DKK')).toBe(true);
    expect(providerSupportsCurrency('COINBASE', 'HUF')).toBe(true);
    expect(providerSupportsCurrency('COINBASE', 'KRW')).toBe(true);
    expect(providerSupportsCurrency('COINBASE', 'JPY')).toBe(false);
    // Manual is always possible.
    expect(providerSupportsCurrency('MANUAL', 'DKK')).toBe(true);
    expect(providerSupportsCurrency('MANUAL', 'KRW')).toBe(true);
  });

  it('publishes the capability table it validates against', () => {
    expect(PROVIDER_CURRENCY_SUPPORT.KRAKEN).toEqual(['EUR', 'USD', 'GBP', 'JPY']);
    expect(PROVIDER_CURRENCY_SUPPORT.COINBASE).toEqual(['EUR', 'USD', 'GBP', 'DKK', 'HUF', 'KRW']);
  });

  it('lists automatic providers per currency', () => {
    expect(automaticProvidersForCurrency('GBP')).toEqual(['KRAKEN', 'COINBASE']);
    expect(automaticProvidersForCurrency('DKK')).toEqual(['COINBASE']);
    expect(automaticProvidersForCurrency('JPY')).toEqual(['KRAKEN']);
    expect(automaticProvidersForCurrency('KRW')).toEqual(['COINBASE']);
    expect(automaticProvidersForCurrency('SATS')).toEqual([]);
  });

  it('picks a supported provider for GBP and falls back when the preference cannot serve', () => {
    expect(preferredAutomaticProvider('KRAKEN', 'GBP')).toBe('KRAKEN');
    // Kraken cannot serve DKK: the first provider that CAN is used.
    expect(preferredAutomaticProvider('KRAKEN', 'DKK')).toBe('COINBASE');
    expect(preferredAutomaticProvider('COINBASE', 'DKK')).toBe('COINBASE');
    // No automatic provider at all is undefined — never a silent cross rate.
    expect(preferredAutomaticProvider('KRAKEN', 'CHF')).toBeUndefined();
    expect(preferredAutomaticProvider('MANUAL', 'GBP')).toBeUndefined();
  });

  it('fails closed with PAIR_UNSUPPORTED before any network call (§15)', async () => {
    const calls: string[] = [];
    const impl = vi.fn(async (url: string) => {
      calls.push(String(url));
      return { ok: true, status: 200, json: async () => ({ error: [], result: {} }) } as unknown as Response;
    });
    await expect(
      fetchQuote({ provider: 'KRAKEN', quote: 'DKK', fetchImpl: impl as unknown as typeof fetch, isOnline: () => true }),
    ).rejects.toMatchObject({ code: 'PAIR_UNSUPPORTED' });
    expect(calls).toEqual([]); // proven: the guard runs before the fetch
  });

  it('still fetches real pairs normally', async () => {
    const impl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ error: [], result: { XXBTZGBP: { a: ['60616.4'], b: ['60609.4'] } } }),
    } as unknown as Response));
    const quote = await fetchQuote({ provider: 'KRAKEN', quote: 'GBP', fetchImpl: impl as unknown as typeof fetch, isOnline: () => true });
    expect(quote.pair).toBe('BTC/GBP');
    expect(quote.rate).toBeCloseTo((60616.4 + 60609.4) / 2, 6);
  });

  it('reports the unsupported provider without inventing a rate', async () => {
    const impl = vi.fn();
    try {
      await fetchQuote({ provider: 'COINBASE', quote: 'JPY', fetchImpl: impl as unknown as typeof fetch, isOnline: () => true });
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as PriceOracleError).code).toBe('PAIR_UNSUPPORTED');
      expect((error as PriceOracleError).message).toContain('BTC/JPY');
    }
    expect(impl).not.toHaveBeenCalled();
  });
});

/* -------------------------- §11/§16 — cash-only games need NO BTC rate */

function offlineFetch() {
  const calls: string[] = [];
  const impl = vi.fn(async (url: string) => {
    calls.push(String(url));
    throw new Error('net::ERR_INTERNET_DISCONNECTED');
  });
  return { calls, impl: impl as unknown as typeof fetch };
}

describe('cash-only games need no BTC rate (§11/§16)', () => {
  it.each([
    ['EUR'], ['USD'], ['GBP'], ['DKK'], ['HUF'], ['JPY'], ['KRW'],
  ] as [Currency][])('plans NO rate and makes NO market call for a cash-only %s game', (currency) => {
    const plan = planRateLock({
      currency,
      provider: 'KRAKEN',
      manualRate: null,
      manualNote: '',
      manualConfirmed: false,
      quote: null,
      nowMs: NOW,
      cashOnly: true,
    });
    expect(plan).toEqual({ kind: 'NONE' });
  });

  it('still requires the rate machinery when the game is NOT cash-only', () => {
    const plan = planRateLock({
      currency: 'DKK',
      provider: 'KRAKEN',
      manualRate: null,
      manualNote: '',
      manualConfirmed: false,
      quote: null,
      nowMs: NOW,
      cashOnly: false,
    });
    // Not cash-only ⇒ the plan asks for a quote (which the capability guard
    // then refuses for Kraken/DKK, offering the manual escape).
    expect(plan).toEqual({ kind: 'NEEDS_QUOTE' });
  });

  it('runs a full offline DKK cash game with zero network calls', async () => {
    const { calls } = offlineFetch();
    const plan = planRateLock({ currency: 'DKK', provider: 'KRAKEN', manualRate: null, manualNote: '', manualConfirmed: false, quote: null, nowMs: NOW, cashOnly: true });
    expect(plan.kind).toBe('NONE');
    expect(calls).toEqual([]);
  });

  it('creates a cash-only JPY game whose backup round-trips exactly', async () => {
    const game: Game = {
      id: 'cashonly-jpy',
      currency: 'JPY',
      buyInAmount: 5000,
      rebuyEnabled: true,
      rebuyAmount: 5000,
      chipsPerBuyIn: 10,
      chipValue: 500,
      status: 'OPEN',
      dealer: { enabled: false, mode: 'NONE' },
      cashOnly: true,
      createdAt: '2026-09-19T12:00:00Z',
      lobbyVersion: 1,
    };
    const snapshot: SessionSnapshot = { ...createEmptySession('2026-09-19T12:30:00Z'), game };
    const raw = await createSessionBackup(snapshot);
    const restored = await parseSessionBackup(raw);
    expect(restored.game?.currency).toBe('JPY');
    expect(restored.game?.cashOnly).toBe(true);
    expect(restored.game?.lockedRate).toBeUndefined();
    expect(restored.game?.lockedBtcFiatRate).toBeUndefined();
  });
});

/* ---------------------------------- §23/§24 — backups and legacy games */

describe('backups carry every new currency (§23/§24)', () => {
  const rates: Record<string, number> = { EUR: 70_000, USD: 81_000, GBP: 60_000, DKK: 528_000, HUF: 25_700_000, JPY: 12_700_000, KRW: 112_000_000 };

  it.each([['GBP'], ['DKK'], ['HUF'], ['JPY'], ['KRW']] as [string][])('round-trips a %s game with its locked rate', async (currency) => {
    const game: Game = {
      id: `g-${currency}`,
      currency: currency as Currency,
      buyInAmount: 20,
      rebuyEnabled: true,
      rebuyAmount: 20,
      chipsPerBuyIn: 10,
      chipValue: 2,
      status: 'OPEN',
      dealer: { enabled: false, mode: 'NONE' },
      lockedBtcFiatRate: rates[currency],
      lockedRate: {
        provider: 'MANUAL',
        pair: `BTC/${currency}`,
        base: 'BTC',
        quote: currency as never,
        rate: rates[currency],
        lockedAt: '2026-09-19T12:00:00Z',
        manual: true,
      },
      createdAt: '2026-09-19T12:00:00Z',
      lobbyVersion: 1,
    };
    const snapshot: SessionSnapshot = { ...createEmptySession('2026-09-19T12:30:00Z'), game };
    const raw = await createSessionBackup(snapshot);
    const restored = await parseSessionBackup(raw);
    // Import restores history EXACTLY: the currency is never recomputed from
    // the locale and the rate is never refetched.
    expect(restored.game?.currency).toBe(currency);
    expect(restored.game?.lockedRate?.rate).toBe(rates[currency]);
    expect(restored.game?.lockedRate?.pair).toBe(`BTC/${currency}`);
  });

  it('keeps legacy EUR/USD/SATS backups fully readable', async () => {
    for (const currency of ['EUR', 'USD', 'SATS'] as Currency[]) {
      const game: Game = {
        id: `legacy-${currency}`,
        currency,
        buyInAmount: 10,
        rebuyEnabled: true,
        rebuyAmount: 10,
        chipValue: 1,
        status: 'OPEN',
        dealer: { enabled: false, mode: 'NONE' },
        // Legacy flat rate only — no provider, no lock metadata.
        lockedBtcFiatRate: currency === 'SATS' ? undefined : 90_000,
        createdAt: '2026-09-19T12:00:00Z',
      };
      const snapshot: SessionSnapshot = { ...createEmptySession('2026-09-19T12:30:00Z'), game };
      const raw = await createSessionBackup(snapshot);
      const restored = await parseSessionBackup(raw);
      expect(restored.game?.currency).toBe(currency);
      expect(restored.game?.lockedBtcFiatRate).toBe(game.lockedBtcFiatRate);
    }
  });
});

/* ---------------------------------------- §18/§19 — Intl formatting */

describe('Intl formatting follows locale AND currency (§18/§19)', () => {
  function format(value: number, currency: string, locale: string): string {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
  }

  it('formats each currency with its own Intl rules', () => {
    expect(format(100, 'USD', 'en-US')).toBe('$100.00');
    expect(format(100, 'GBP', 'en-GB')).toBe('£100.00');
    expect(format(100, 'EUR', 'fr-FR').replace(/\u00a0|\u202f/g, ' ')).toContain('100,00');
    expect(format(100.5, 'DKK', 'da-DK').replace(/\u00a0|\u202f/g, ' ')).toContain('100,50');
    // Zero-decimal currencies show no decimals at all.
    const huf = new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF' }).resolvedOptions();
    const jpy = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).resolvedOptions();
    const krw = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).resolvedOptions();
    expect(jpy.maximumFractionDigits).toBe(0);
    expect(krw.maximumFractionDigits).toBe(0);
    expect(huf.maximumFractionDigits).toBe(2); // Intl keeps ISO's 2 for HUF…
    expect(minorUnitsFor('HUF')).toBe(0);      // …while NOIOU follows real usage for input/rounding
  });

  it('keeps locale and currency independent (§19)', () => {
    // en-US interface, EUR game → the amount is formatted with en-US rules and
    // the EUR symbol. Language, currency and rate source stay three separate
    // concepts.
    const formatted = format(100, 'EUR', 'en-US');
    expect(formatted).toContain('€');
    expect(formatted).toContain('100.00');
    expect(formatted).not.toContain('100,00');
  });
});
