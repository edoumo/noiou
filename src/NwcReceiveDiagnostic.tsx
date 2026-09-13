import { useRef, useState } from 'react';
import LightningInvoiceCard from './LightningInvoiceCard';
import type { LightningInvoice } from './lightning';
import { NwcReceiveOnlyAdapter, type NwcReceiveConnectionInfo } from './nwcReceive';
import './nwcReceive.css';

export default function NwcReceiveDiagnostic() {
  const adapterRef = useRef<NwcReceiveOnlyAdapter | null>(null);
  const [uri, setUri] = useState('');
  const [connection, setConnection] = useState<NwcReceiveConnectionInfo | null>(null);
  const [amountSats, setAmountSats] = useState(21);
  const [invoice, setInvoice] = useState<LightningInvoice | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
    if (!secretUri) throw new Error('Colle une URI NWC receive-only');
    setUri('');
    adapterRef.current?.close();
    adapterRef.current = null;
    setConnection(null);
    setInvoice(null);

    const adapter = await NwcReceiveOnlyAdapter.connect(secretUri);
    adapterRef.current = adapter;
    setConnection(adapter.connection);
    setStatus('Wallet NWC connecté en réception seule. Secret conservé uniquement en mémoire vive.');
  }

  function disconnect() {
    adapterRef.current?.close();
    adapterRef.current = null;
    setConnection(null);
    setInvoice(null);
    setUri('');
    setError('');
    setStatus('Connexion NWC supprimée de la mémoire vive.');
  }

  async function createInvoice() {
    const adapter = adapterRef.current;
    if (!adapter) throw new Error('Connecte d’abord un wallet NWC receive-only');
    if (!Number.isInteger(amountSats) || amountSats <= 0 || amountSats > 1000) {
      throw new Error('Pour le diagnostic, utilise un montant entier entre 1 et 1000 sats');
    }
    const created = await adapter.createInvoice(amountSats, 'NOIOU receive-only diagnostic');
    setInvoice(created);
    setStatus('Invoice NWC réelle créée. Elle est hors cagnotte et hors ledger de partie.');
  }

  async function checkInvoice() {
    const adapter = adapterRef.current;
    if (!adapter || !invoice) throw new Error('Aucune invoice NWC active');
    const nextStatus = await adapter.getInvoiceStatus(invoice.id);
    setInvoice({ ...invoice, status: nextStatus });
    setStatus(nextStatus === 'PAID' ? 'Paiement NWC reçu et confirmé par le wallet.' : `Statut wallet : ${nextStatus}`);
  }

  return (
    <section className="nwc-diagnostic" aria-labelledby="nwc-live-title">
      <div className="nwc-diagnostic-heading">
        <div>
          <p className="nwc-kicker">Diagnostic privé · fonds réels possibles</p>
          <h2 id="nwc-live-title">NWC réception seule</h2>
          <p>
            Ce module teste uniquement <code>get_info</code>, <code>make_invoice</code> et <code>lookup_invoice</code>.
            NOIOU refuse une connexion qui expose une permission de paiement sortant.
          </p>
        </div>
        <span className={connection ? 'nwc-live' : 'nwc-off'}>{connection ? 'RECEIVE ONLY' : 'DÉCONNECTÉ'}</span>
      </div>

      {!connection ? (
        <div className="nwc-connect-form">
          <label>
            URI NWC dédiée à NOIOU
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
          <button disabled={busy || !uri.trim()} onClick={() => void run(connect)}>Connecter en réception seule</button>
          <small>
            Génère une connexion NWC limitée à <code>get_info</code>, <code>make_invoice</code> et <code>lookup_invoice</code>.
            L’URI n’est ni journalisée, ni sauvegardée, ni exportée.
          </small>
        </div>
      ) : (
        <>
          <div className="nwc-wallet-summary">
            <div><strong>{connection.alias || 'Wallet NWC'}</strong><small>{connection.network || 'réseau non indiqué'}</small></div>
            <div><strong>{connection.relays.length}</strong><small>relay(s) WSS</small></div>
            <div><strong>{connection.methods.length}</strong><small>permission(s)</small></div>
            <button onClick={disconnect}>Déconnecter</button>
          </div>

          <div className="nwc-test-box">
            <label>
              Montant du test réel
              <div className="nwc-amount"><input type="number" min="1" max="1000" step="1" value={amountSats} onChange={(event) => setAmountSats(Number(event.target.value))} /><span>sats</span></div>
            </label>
            <button disabled={busy} onClick={() => void run(createInvoice)}>Créer une invoice réelle</button>
            <small>Ce paiement va réellement créditer le wallet connecté. Le test est volontairement plafonné à 1000 sats.</small>
          </div>

          {invoice && <LightningInvoiceCard invoice={invoice} onSimulatePaid={() => void run(checkInvoice)} />}
        </>
      )}

      {status && <div className="nwc-status">{status}</div>}
      {error && <div className="nwc-error" role="alert">{error}</div>}

      <div className="nwc-boundary">
        <strong>Hors périmètre de cette étape :</strong> aucune cave réelle n’est encore reliée à NWC et aucun payout Lightning n’est exécuté par NOIOU.
      </div>
    </section>
  );
}
