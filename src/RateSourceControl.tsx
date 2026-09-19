/**
 * Rate source control (NOIOU) — game creation form block.
 *
 * Presents the BTC/fiat rate source for the game being created:
 * - Kraken (default automatic source) / Coinbase / Manual;
 * - fetches a live quote on demand and shows bid · ask · midpoint;
 * - on any failure shows an explicit recovery panel (retry · change source ·
 *   use a manual rate) — NOIOU never invents a price and never falls back to
 *   manual silently;
 * - in Manual mode shows the rate field, an unverified-value warning, the
 *   optional source note and an explicit confirmation checkbox.
 *
 * Manual can be selected BEFORE any Kraken attempt, so a user who knows they
 * are offline never waits for a network timeout.
 */
import { useEffect, useState } from 'react';
import { useI18n } from './i18n/provider';
import {
  fetchQuote,
  isQuoteFresh,
  providerLabelKey,
  PRICE_PROVIDER_IDS,
  PriceOracleError,
  type LockedRate,
  type RateProviderId,
  type RateQuote,
} from './priceOracle';
import { isManualLockedRate } from './ratePlan';
import type { Currency } from './domain';
import './rateSource.css';

export interface RateSourceState {
  provider: RateProviderId;
  quote: RateQuote | null;
  quoteError: PriceOracleError | null;
  fetching: boolean;
  manualRate: number | null;
  manualNote: string;
  manualConfirmed: boolean;
}

export interface RateSourceControlProps {
  currency: Currency;
  state: RateSourceState;
  online: boolean;
  onChange: (next: Partial<RateSourceState>) => void;
  /** Override used by tests to inject a deterministic fetch. */
  fetchImpl?: typeof fetch;
}

/** Error codes that mean "the network itself is not reachable". */
const NETWORK_CODES = new Set(['OFFLINE', 'NETWORK', 'TIMEOUT']);

export function RateSourceControl({ currency, state, online, onChange, fetchImpl }: RateSourceControlProps) {
  const { t, formatNumber } = useI18n();
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Freshness countdown: a locked automatic quote older than the window must
  // be refetched before the game can be created.
  useEffect(() => {
    if (!state.quote || state.provider === 'MANUAL') return;
    const timer = window.setInterval(() => setNowTick(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, [state.quote, state.provider]);

  if (currency === 'SATS') {
    // SATS games need no BTC/fiat oracle at all — no call, no field.
    return (
      <div className="rate-source" data-floating-safe-zone="rate">
        <p className="muted rate-source-note">{t('rate.satsNoOracle')}</p>
      </div>
    );
  }

  const isManual = state.provider === 'MANUAL';
  const quoteStale = Boolean(state.quote && !isQuoteFresh(state.quote, nowTick));
  const errorNetwork = Boolean(state.quoteError && NETWORK_CODES.has(state.quoteError.code));

  function selectProvider(provider: RateProviderId) {
    // Switching source never reuses the previous provider's quote: it is
    // dropped so an automatic rate can never be mislabelled with another
    // provider's values.
    onChange({ provider, quote: provider === 'MANUAL' ? null : state.quote?.provider === provider ? state.quote : null, quoteError: null });
  }

  async function refresh() {
    onChange({ fetching: true, quoteError: null });
    try {
      const quote = await fetchQuote({
        provider: state.provider,
        quote: currency === 'USD' ? 'USD' : 'EUR',
        fetchImpl,
        isOnline: () => online,
      });
      onChange({ quote, quoteError: null, fetching: false });
    } catch (caught) {
      const error = caught instanceof PriceOracleError
        ? caught
        : new PriceOracleError('NETWORK', caught instanceof Error ? caught.message : String(caught), state.provider);
      onChange({ quoteError: error, fetching: false, quote: null });
    }
  }

  return (
    <div className="rate-source" data-floating-safe-zone="rate">
      <label>{t('rate.source')}
        <select value={state.provider} onChange={(event) => selectProvider(event.target.value as RateProviderId)}>
          {PRICE_PROVIDER_IDS.map((provider) => (
            <option key={provider} value={provider}>{t(providerLabelKey(provider))}</option>
          ))}
        </select>
      </label>

      {!isManual && (
        <div className="rate-quote">
          {!online && (
            // §15: the browser reporting no connection shows immediate help —
            // the user must never wait for a network timeout to learn that
            // Kraken cannot be queried. The manual escape is one click away.
            <div className="rate-error" role="alert">
              <strong>{t('rate.offlineTitle')}</strong>
              <small>{t('rate.offlineBody', { provider: t(providerLabelKey(state.provider)) })}</small>
              <div className="rate-error-actions">
                <button type="button" onClick={() => void refresh()}>{t('rate.retry')}</button>
                <button type="button" onClick={() => selectProvider('MANUAL')}>{t('rate.useManual')}</button>
                <button type="button" onClick={() => selectProvider(state.provider === 'KRAKEN' ? 'COINBASE' : 'KRAKEN')}>{t('rate.changeSource')}</button>
              </div>
            </div>
          )}
          {online && !state.quote && !state.fetching && (
            <button type="button" onClick={() => void refresh()}>{t('rate.fetch')}</button>
          )}
          {state.fetching && <p className="muted">{t('rate.fetching')}</p>}

          {state.quote && (
            <p className="rate-quote-line">
              <strong>{t('rate.quotePair', { quote: state.quote.quote })}</strong>
              {' · '}
              {t('rate.quoteMidpoint', {
                bid: formatNumber(state.quote.bid, { maximumFractionDigits: 2 }),
                ask: formatNumber(state.quote.ask, { maximumFractionDigits: 2 }),
                rate: formatNumber(state.quote.rate, { maximumFractionDigits: 2 }),
              })}
            </p>
          )}
          {state.quote && quoteStale && <p className="rate-warning">{t('rate.stale')}</p>}
          {state.quote && !quoteStale && <p className="muted">{t('rate.ready')}</p>}

          {state.quoteError && (
            <div className="rate-error" role="alert">
              <strong>{errorNetwork ? t('rate.offlineTitle') : t('rate.errorTitle')}</strong>
              <small>{errorNetwork ? t('rate.offlineBody', { provider: t(providerLabelKey(state.provider)) }) : t('rate.errorBody', { provider: t(providerLabelKey(state.provider)) })}</small>
              <div className="rate-error-actions">
                <button type="button" onClick={() => void refresh()}>{t('rate.retry')}</button>
                <button type="button" onClick={() => selectProvider('MANUAL')}>{t('rate.useManual')}</button>
                <button type="button" onClick={() => selectProvider(state.provider === 'KRAKEN' ? 'COINBASE' : 'KRAKEN')}>{t('rate.changeSource')}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {isManual && (
        <div className="rate-manual">
          <label>{t('rate.manualLabel', { currency })}
            <input
              type="number"
              min="1"
              step="0.01"
              value={state.manualRate ?? ''}
              onChange={(event) => onChange({ manualRate: event.target.value === '' ? null : Number(event.target.value) })}
            />
          </label>
          <p className="rate-warning">{t('rate.manualWarning')}</p>
          <label>{t('rate.manualNote')}
            <input
              type="text"
              value={state.manualNote}
              placeholder={t('rate.manualNotePlaceholder')}
              onChange={(event) => onChange({ manualNote: event.target.value })}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={state.manualConfirmed}
              onChange={(event) => onChange({ manualConfirmed: event.target.checked })}
            />
            {t('rate.manualConfirm')}
          </label>
        </div>
      )}
    </div>
  );
}

/**
 * Rate actually locked on the active game — read-only summary.
 * A manual rate is flagged « Non vérifié par une source de marché » so players
 * can immediately see that an unverified rate was chosen.
 */
export function LockedRateSummary({ locked, compact }: { locked: LockedRate | undefined; compact?: boolean }) {
  const { t, formatNumber, formatTime } = useI18n();
  if (!locked) return null;
  const manual = isManualLockedRate(locked);
  const time = formatTime(locked.lockedAt);
  return (
    <p className={`locked-rate${manual ? ' locked-rate-manual' : ''}`} data-floating-safe-zone="locked-rate">
      <strong>{t('rate.locked')}</strong>
      {' · '}
      {t('rate.lockedLine', {
        provider: t(providerLabelKey(locked.provider)),
        rate: formatNumber(locked.rate, { maximumFractionDigits: 2 }),
        quote: locked.quote,
        time,
      })}
      {manual && <small>{t('rate.unverified')}</small>}
      {locked.manualNote && !compact && <small>{t('rate.noteLine', { note: locked.manualNote })}</small>}
    </p>
  );
}
