import { useEffect, useState } from 'react';
import { useI18n } from './i18n/provider';
import LightningInvoiceCard from './LightningInvoiceCard';
import type { LightningInvoice } from './lightning';
import { useNwcSession } from './NwcSessionContext';
import './nwcReceive.css';

export default function NwcReceiveDiagnostic() {
  const { t } = useI18n();
  const nwc = useNwcSession();
  const [uri, setUri] = useState('');
  const [amountSats, setAmountSats] = useState(21);
  const [invoice, setInvoice] = useState<LightningInvoice | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [expanded, setExpanded] = useState(() => Boolean(nwc.connection || nwc.activeGameLockedToNwc || nwc.liveGameReceiptsArmed));

  async function run(action: () => Promise<void>) {
    try {
      setBusy(true);
      setError('');
      setStatus('');
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    const secretUri = uri.trim();
    if (!secretUri) throw new Error(t('nwcDiag.uriRequired'));
    setUri('');
    setInvoice(null);
    setAcknowledged(false);

    const connection = await nwc.connect(secretUri);
    setStatus(t('nwcDiag.connected', { alias: connection.alias ? t('nwcDiag.connectedAlias', { alias: connection.alias }) : '' }));
  }

  function disconnect() {
    nwc.disconnect();
    setInvoice(null);
    setUri('');
    setAcknowledged(false);
    setError('');
    setStatus(t('nwcDiag.disconnectedNote'));
  }

  function arm() {
    if (!acknowledged) throw new Error(t('nwcDiag.acknowledgeFirst'));
    nwc.armLiveGameReceipts();
    setStatus(t('nwcDiag.armedStatus'));
  }

  function disarm() {
    nwc.disarmLiveGameReceipts();
    setAcknowledged(false);
    setStatus(t('nwcDiag.disarmedStatus'));
  }

  async function createInvoice() {
    if (!nwc.transportConnected) throw new Error(t('nwcDiag.connectFirst'));
    if (!Number.isInteger(amountSats) || amountSats <= 0 || amountSats > 1000) {
      throw new Error(t('nwcDiag.testAmountRange'));
    }
    const created = await nwc.createDiagnosticInvoice(amountSats, 'NOIOU receive-only diagnostic');
    setInvoice(created);
    setStatus(t('nwcDiag.invoiceCreated'));
  }

  async function checkInvoice() {
    if (!invoice) throw new Error(t('nwcDiag.noActiveInvoice'));
    const nextStatus = await nwc.getInvoiceStatus(invoice);
    setInvoice({ ...invoice, status: nextStatus });
    setStatus(nextStatus === 'PAID' ? t('nwcDiag.paymentReceived') : t('nwcDiag.walletStatus', { status: nextStatus }));
  }

  const connection = nwc.connection;
  const gameModeLabel = nwc.activeGameLockedToNwc
    ? t('nwcDiag.state.locked')
    : nwc.liveGameReceiptsArmed
      ? t('nwcDiag.state.armed')
      : t('nwcDiag.state.diagnostic');
  const keepOpen = Boolean(connection || nwc.activeGameLockedToNwc || nwc.liveGameReceiptsArmed);

  useEffect(() => {
    if (keepOpen) setExpanded(true);
  }, [keepOpen]);

  return (
    <details className="nwc-diagnostic-shell" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>
        <span>{t('nwcDiag.summary')}</span>
        <small>{keepOpen ? gameModeLabel : t('nwcDiag.summaryHint')}</small>
      </summary>
      <section className="nwc-diagnostic" aria-labelledby="nwc-live-title">
        <div className="nwc-diagnostic-heading">
          <div>
            <p className="nwc-kicker">{t('nwcDiag.kicker')}</p>
            <h2 id="nwc-live-title">{t('nwcDiag.title')}</h2>
            <p>{t('nwcDiag.intro')}</p>
          </div>
          <span className={connection ? 'nwc-live' : 'nwc-off'}>{connection ? gameModeLabel : (nwc.activeGameLockedToNwc ? t('nwcDiag.state.reconnect') : t('nwcDiag.state.disconnected'))}</span>
        </div>

        {!connection ? (
          <div className="nwc-connect-form">
            {nwc.activeGameLockedToNwc && <div className="nwc-error" role="alert">{t('nwcDiag.lockedAlert')}</div>}
            <label>
              {t('nwcDiag.uriLabel')}
              <input
                type="password"
                value={uri}
                onChange={(event) => setUri(event.target.value)}
                placeholder="nostr+walletconnect://…"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                disabled={busy}
              />
            </label>
            <button disabled={busy || !uri.trim()} onClick={() => void run(connect)}>{t('nwcDiag.connect')}</button>
            <small>{t('nwcDiag.permissions')}</small>
          </div>
        ) : (
          <>
            <div className="nwc-wallet-summary">
              <div><strong>{connection.alias || t('nwcDiag.walletDefault')}</strong><small>{connection.network || t('nwcDiag.networkUnknown')}</small></div>
              <div><strong>{connection.relays.length}</strong><small>{t('nwcDiag.relays')}</small></div>
              <div><strong>{connection.methods.length}</strong><small>{t('nwcDiag.methods')}</small></div>
              <button onClick={disconnect}>{t('nwcDiag.disconnect')}</button>
            </div>

            <div className="nwc-test-box">
              <label>
                {t('nwcDiag.testAmount')}
                <div className="nwc-amount"><input type="number" min="1" max="1000" step="1" value={amountSats} onChange={(event) => setAmountSats(Number(event.target.value))} /><span>sats</span></div>
              </label>
              <button disabled={busy} onClick={() => void run(createInvoice)}>{t('nwcDiag.createInvoice')}</button>
              <small>{t('nwcDiag.testNote')}</small>
            </div>

            {invoice && <LightningInvoiceCard invoice={invoice} onSimulatePaid={() => void run(checkInvoice)} />}

            <div className="nwc-test-box">
              <strong>{nwc.activeGameLockedToNwc ? t('nwcDiag.armed.locked') : nwc.liveGameReceiptsArmed ? t('nwcDiag.armed.armed') : t('nwcDiag.armed.disarmed')}</strong>
              {nwc.activeGameLockedToNwc ? (
                <>
                  <small>{t('nwcDiag.armed.lockedNote')}</small>
                  <button onClick={() => void run(async () => disarm())}>{t('nwcDiag.armed.release')}</button>
                </>
              ) : !nwc.liveGameReceiptsArmed ? (
                <>
                  <label className="check">
                    <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
                    {t('nwcDiag.armed.acknowledge')}
                  </label>
                  <button disabled={!acknowledged} onClick={() => void run(async () => arm())}>{t('nwcDiag.armed.arm')}</button>
                </>
              ) : (
                <button onClick={() => void run(async () => disarm())}>{t('nwcDiag.armed.disarm')}</button>
              )}
              <small>{t('nwcDiag.armed.note')}</small>
            </div>
          </>
        )}

        {status && <div className="nwc-status">{status}</div>}
        {error && <div className="nwc-error" role="alert">{error}</div>}

        <div className="nwc-boundary">
          <strong>{t('nwcDiag.boundaryStrong')}</strong> {t('nwcDiag.boundary')}
        </div>
      </section>
    </details>
  );
}
