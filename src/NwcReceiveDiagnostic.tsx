import { useState } from 'react';
import LightningInvoiceCard from './LightningInvoiceCard';
import type { LightningInvoice } from './lightning';
import { useNwcSession } from './NwcSessionContext';
import './nwcReceive.css';

export default function NwcReceiveDiagnostic() {
  const nwc = useNwcSession();
  const [uri, setUri] = useState('');
  const [amountSats, setAmountSats] = useState(21);
  const [invoice, setInvoice] = useState<LightningInvoice | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

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
    setInvoice(null);
    setAcknowledged(false);

    const connection = await nwc.connect(secretUri);
    setStatus(`Wallet NWC connecté en réception seule${connection.alias ? ` : ${connection.alias}` : ''}.`);
  }

  function disconnect() {
    nwc.disconnect();
    setInvoice(null);
    setUri('');
    setAcknowledged(false);
    setError('');
    setStatus('Connexion NWC supprimée de la mémoire vive. Si une partie réelle est en cours, NOIOU restera verrouillé sur NWC et exigera une reconnexion avant toute nouvelle cave/rebuy.');
  }

  function arm() {
    if (!acknowledged) throw new Error('Confirme d’abord que tu comprends que les prochaines caves Lightning pourront être réelles');
    nwc.armLiveGameReceipts();
    setStatus('Réception réelle armée. Les prochaines caves/rebuys Lightning utiliseront NWC.');
  }

  function disarm() {
    nwc.disarmLiveGameReceipts();
    setAcknowledged(false);
    setStatus('Réception réelle désarmée. Les caves/rebuys Lightning reviennent au mock.');
  }

  async function createInvoice() {
    if (!nwc.transportConnected) throw new Error('Connecte d’abord un wallet NWC receive-only');
    if (!Number.isInteger(amountSats) || amountSats <= 0 || amountSats > 1000) {
      throw new Error('Pour le diagnostic, utilise un montant entier entre 1 et 1000 sats');
    }
    const created = await nwc.createDiagnosticInvoice(amountSats, 'NOIOU receive-only diagnostic');
    setInvoice(created);
    setStatus('Invoice NWC réelle créée. Elle est hors cagnotte et hors ledger de partie.');
  }

  async function checkInvoice() {
    if (!invoice) throw new Error('Aucune invoice NWC active');
    const nextStatus = await nwc.getInvoiceStatus(invoice);
    setInvoice({ ...invoice, status: nextStatus });
    setStatus(nextStatus === 'PAID' ? 'Paiement NWC reçu et confirmé par le wallet.' : `Statut wallet : ${nextStatus}`);
  }

  const connection = nwc.connection;
  const gameModeLabel = nwc.activeGameLockedToNwc
    ? 'PARTIE NWC VERROUILLÉE'
    : nwc.liveGameReceiptsArmed
      ? 'RÉEL ARMÉ'
      : 'DIAGNOSTIC';
  const keepOpen = Boolean(connection || nwc.activeGameLockedToNwc || nwc.liveGameReceiptsArmed);

  return (
    <details className="nwc-diagnostic-shell" defaultOpen={keepOpen} key={keepOpen ? 'nwc-active' : 'nwc-optional'}>
      <summary>
        <span>⚙️ NWC réception seule</span>
        <small>{keepOpen ? gameModeLabel : 'Option · ouvrir uniquement si tu utilises NWC automatique'}</small>
      </summary>
      <section className="nwc-diagnostic" aria-labelledby="nwc-live-title">
        <div className="nwc-diagnostic-heading">
          <div>
            <p className="nwc-kicker">Connexion privée · réception Lightning réelle</p>
            <h2 id="nwc-live-title">NWC réception seule</h2>
            <p>
              La connexion peut servir aux diagnostics et, seulement après armement explicite, aux caves/rebuys réels.
              NOIOU refuse toute permission de paiement sortant.
            </p>
          </div>
          <span className={connection ? 'nwc-live' : 'nwc-off'}>{connection ? gameModeLabel : (nwc.activeGameLockedToNwc ? 'RECONNEXION REQUISE' : 'DÉCONNECTÉ')}</span>
        </div>

        {!connection ? (
          <div className="nwc-connect-form">
            {nwc.activeGameLockedToNwc && <div className="nwc-error" role="alert">Cette partie est déjà engagée en NWC réel. Reconnecte le wallet receive-only avant toute nouvelle cave/rebuy Lightning : NOIOU ne basculera pas en mock.</div>}
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
              Utilise une connexion limitée à <code>get_info</code>, <code>make_invoice</code> et <code>lookup_invoice</code>.
              L’URI est effacée du champ dès la tentative de connexion et n’est ni journalisée, ni sauvegardée, ni exportée.
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
                Montant du test diagnostic
                <div className="nwc-amount"><input type="number" min="1" max="1000" step="1" value={amountSats} onChange={(event) => setAmountSats(Number(event.target.value))} /><span>sats</span></div>
              </label>
              <button disabled={busy} onClick={() => void run(createInvoice)}>Créer une invoice réelle de diagnostic</button>
              <small>Ce paiement crédite réellement le wallet connecté, mais reste hors cagnotte. Le diagnostic est plafonné à 1000 sats.</small>
            </div>

            {invoice && <LightningInvoiceCard invoice={invoice} onSimulatePaid={() => void run(checkInvoice)} />}

            <div className="nwc-test-box">
              <strong>{nwc.activeGameLockedToNwc ? 'Partie active verrouillée en NWC réel' : nwc.liveGameReceiptsArmed ? 'Caves réelles armées' : 'Caves réelles désarmées'}</strong>
              {nwc.activeGameLockedToNwc ? (
                <>
                  <small>Le retour au mock est bloqué tant que la session locale indique une partie NWC réelle active. Après clôture/réinitialisation, le bouton ci-dessous libère l’état en mémoire.</small>
                  <button onClick={() => void run(async () => disarm())}>Libérer le verrou après clôture/réinitialisation</button>
                </>
              ) : !nwc.liveGameReceiptsArmed ? (
                <>
                  <label className="check">
                    <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
                    Je comprends que les prochaines caves/rebuys Lightning créeront de vraies invoices et créditeront réellement le wallet connecté.
                  </label>
                  <button disabled={!acknowledged} onClick={() => void run(async () => arm())}>Armer les caves réelles</button>
                </>
              ) : (
                <button onClick={() => void run(async () => disarm())}>Désarmer les caves réelles</button>
              )}
              <small>L’armement initial est volatil et n’enregistre aucun secret NWC. Dès qu’une partie est engagée en NWC réel, le mode réel reste verrouillé pour empêcher un fallback mock silencieux.</small>
            </div>
          </>
        )}

        {status && <div className="nwc-status">{status}</div>}
        {error && <div className="nwc-error" role="alert">{error}</div>}

        <div className="nwc-boundary">
          <strong>Limite maintenue :</strong> aucun payout Lightning n’est exécuté par NOIOU. Les sorties restent manuelles dans le wallet de l’organisateur.
        </div>
      </section>
    </details>
  );
}
