import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { PaymentMethod, Player } from './domain';
import { appendLedgerEvent, verifyLedger } from './ledger';
import LightningDestinationField from './LightningDestinationField';
import { paymentChoiceLabel } from './paymentFlow';
import {
  buildPartyInviteUrl,
  createPartyInvite,
  createPartyJoinResponse,
  encodePartyJoinResponse,
  parsePartyInvite,
  parsePartyJoinResponse,
  type PartyInvite,
} from './partyJoin';
import QrCameraScanner from './QrCameraScanner';
import { decodeQrImageFile } from './qrImageImport';
import { readPageOrigin, rememberPendingJoinLanding } from './joinLanding';
import { loadSession, saveSession } from './session';
import './partyJoin.css';

type Mode = 'CLOSED' | 'ORGANIZER' | 'SCAN_INVITE' | 'SCAN_RESPONSE' | 'PARTICIPANT' | 'RESPONSE';

export default function PartyJoinControl() {
  const [mode, setMode] = useState<Mode>('CLOSED');
  const [invite, setInvite] = useState<PartyInvite | null>(null);
  const [inviteUrl, setInviteUrl] = useState('');
  const [responseQr, setResponseQr] = useState('');
  const [nickname, setNickname] = useState('');
  const [preferredPayment, setPreferredPayment] = useState<PaymentMethod | 'ANY'>('CASH');
  const [lightningDestination, setLightningDestination] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inviteImageRef = useRef<HTMLInputElement | null>(null);
  const responseImageRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const encoded = new URL(window.location.href).searchParams.get('join');
    if (!encoded) return;
    try {
      const parsed = parsePartyInvite(encoded);
      setInvite(parsed);
      setMode('PARTICIPANT');
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'QR de partie invalide');
    }
  }, []);

  function close() {
    setMode('CLOSED');
    setError('');
  }

  function openOrganizer() {
    try {
      setError('');
      if (typeof window === 'undefined') return;
      const snapshot = loadSession(window.localStorage);
      if (!snapshot?.game || snapshot.game.status !== 'OPEN') throw new Error('Configure une partie avant d’afficher son QR d’invitation.');
      const chipsPerBuyIn = snapshot.game.chipsPerBuyIn ?? (() => {
        const legacy = snapshot.game.buyInAmount / snapshot.game.chipValue;
        return Number.isInteger(legacy) && legacy > 0 ? legacy : undefined;
      })();
      const nextInvite = createPartyInvite(
        snapshot.game.id,
        snapshot.game.currency,
        snapshot.game.buyInAmount,
        snapshot.game.createdAt,
        chipsPerBuyIn,
      );
      setInvite(nextInvite);
      setInviteUrl(buildPartyInviteUrl(window.location.origin, nextInvite));
      setMode('ORGANIZER');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setMode('ORGANIZER');
    }
  }

  function applyInvite(raw: string) {
    try {
      setError('');
      const parsed = parsePartyInvite(raw);
      setInvite(parsed);
      setNickname('');
      setPreferredPayment('CASH');
      setLightningDestination('');
      setMode('PARTICIPANT');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function importInviteImage(file: File) {
    try { applyInvite(await decodeQrImageFile(file)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
  }

  function buildResponse() {
    if (!invite) return;
    try {
      setError('');
      const response = createPartyJoinResponse({
        gameId: invite.gameId,
        nickname,
        preferredPayment,
        lightningDestination: lightningDestination.trim() || undefined,
      });
      setResponseQr(encodePartyJoinResponse(response));
      setMode('RESPONSE');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function acceptResponse(raw: string) {
    if (typeof window === 'undefined') return;
    try {
      setBusy(true);
      setError('');
      const response = parsePartyJoinResponse(raw);
      const snapshot = loadSession(window.localStorage);
      if (!snapshot?.game || snapshot.game.status !== 'OPEN') throw new Error('Aucune partie ouverte à laquelle ajouter ce joueur.');
      if (response.gameId !== snapshot.game.id) throw new Error('Cette réponse appartient à une autre partie.');
      if (!await verifyLedger(snapshot.ledger)) throw new Error('Journal d’audit invalide : ajout du joueur bloqué.');
      if (snapshot.players.some((player) => player.nickname.toLocaleLowerCase() === response.nickname.toLocaleLowerCase())) throw new Error('Ce pseudo est déjà utilisé dans la partie.');

      const player: Player = {
        id: crypto.randomUUID(),
        nickname: response.nickname,
        preferredPayment: response.preferredPayment,
        lightningAddress: response.lightningDestination,
      };
      const ledgerEvent = await appendLedgerEvent(snapshot.ledger, {
        gameId: snapshot.game.id,
        type: 'PLAYER_JOINED',
        payload: {
          playerId: player.id,
          nickname: player.nickname,
          preferredPayment: player.preferredPayment,
          reusableLightningDestination: Boolean(player.lightningAddress),
          joinMethod: 'QR_HANDSHAKE',
        },
      });
      const next = {
        ...snapshot,
        savedAt: new Date().toISOString(),
        players: [...snapshot.players, player],
        ledger: [...snapshot.ledger, ledgerEvent],
      };
      // UX26-F1: the reload below rebuilds the state with the new player already in the roster,
      // so the classic "player count increased" detection cannot land on the new card. Persist a
      // one-shot landing target (tab-scoped sessionStorage, survives the reload) consumed once by
      // GuidedLobbyControl when the roster is rendered.
      rememberPendingJoinLanding(window.sessionStorage, player.id, readPageOrigin());
      // The reload would otherwise let the browser restore its previous scroll position (non
      // deterministic), displacing the one-shot landing. Suppress it for this navigation only.
      try {
        window.history.scrollRestoration = 'manual';
      } catch {
        // best effort: the landing target works even if the browser still restores
      }
      saveSession(window.localStorage, next);
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setMode('ORGANIZER');
    } finally {
      setBusy(false);
    }
  }

  async function importResponseImage(file: File) {
    try { await acceptResponse(await decodeQrImageFile(file)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
  }

  const paymentNeedsDestination = preferredPayment === 'LIGHTNING' || preferredPayment === 'ANY';
  const inviteTerms = invite
    ? `${invite.currency} · cave ${invite.buyInAmount.toLocaleString('fr-FR')}${invite.chipsPerBuyIn ? ` · ${invite.chipsPerBuyIn.toLocaleString('fr-FR')} jetons` : ''}`
    : '';

  return (
    <>
      <div className="party-join-launcher">
        <button type="button" onClick={openOrganizer}>🎟️ QR de partie</button>
        <button type="button" onClick={() => { setError(''); setMode('SCAN_INVITE'); }}>👥 Rejoindre</button>
      </div>

      {mode !== 'CLOSED' && <div className="party-join-backdrop" role="dialog" aria-modal="true">
        <div className="party-join-panel">
          <div className="party-join-head">
            <div><strong>{mode === 'PARTICIPANT' || mode === 'RESPONSE' || mode === 'SCAN_INVITE' ? 'Rejoindre une partie' : 'Inviter des joueurs'}</strong><small>Échange QR local · aucun compte, aucun fonds, aucun secret wallet</small></div>
            <button type="button" onClick={close}>Fermer</button>
          </div>

          {error && <div className="alert" role="alert">{error}</div>}

          {mode === 'ORGANIZER' && inviteUrl && <>
            <p>Fais scanner ce QR par le téléphone du joueur. Il voit les conditions de la cave, renseigne lui-même son pseudo et, s’il le souhaite, sa destination Lightning.</p>
            <div className="party-join-qr"><QRCodeSVG value={inviteUrl} size={240} level="M" marginSize={2} /></div>
            <small className="party-join-summary">{inviteTerms}</small>
            <div className="party-join-actions">
              <button type="button" onClick={() => setMode('SCAN_RESPONSE')}>📷 Scanner la réponse d’un joueur</button>
              <button type="button" onClick={() => responseImageRef.current?.click()}>🖼️ Réponse depuis Photos</button>
              <input ref={responseImageRef} hidden type="file" accept="image/*" onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = '';
                if (file) void importResponseImage(file);
              }} />
            </div>
            <p className="muted">Version sans backend : le joueur renvoie un second QR que l’organisateur scanne. L’organisateur n’a rien à saisir à sa place.</p>
          </>}

          {mode === 'ORGANIZER' && !inviteUrl && <p className="muted">{error || 'Aucune partie ouverte.'}</p>}

          {mode === 'SCAN_INVITE' && <>
            <p>Scanne le QR de partie affiché par l’organisateur.</p>
            <div className="party-join-actions"><button type="button" onClick={() => inviteImageRef.current?.click()}>🖼️ QR depuis Photos</button></div>
            <input ref={inviteImageRef} hidden type="file" accept="image/*" onChange={(event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = '';
              if (file) void importInviteImage(file);
            }} />
            <QrCameraScanner onDetected={applyInvite} onCancel={close} />
          </>}

          {mode === 'SCAN_RESPONSE' && <>
            <p>Scanne le QR de réponse affiché sur le téléphone du joueur.</p>
            <QrCameraScanner onDetected={(raw) => void acceptResponse(raw)} onCancel={() => setMode('ORGANIZER')} />
          </>}

          {mode === 'PARTICIPANT' && invite && <>
            <div className="party-join-game"><strong>Partie trouvée</strong><span>{inviteTerms}</span></div>
            <p className="muted">Vérifie ces conditions avant de rejoindre : le montant de la cave et le nombre de jetons remis viennent du QR de la partie.</p>
            <label>Pseudo<input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Alice" /></label>
            <label>Paiement de la première cave
              <select value={preferredPayment} onChange={(event) => setPreferredPayment(event.target.value as PaymentMethod | 'ANY')}>
                <option value="CASH">Espèces</option>
                <option value="LIGHTNING">Lightning</option>
                <option value="ANY">Espèces ou Lightning</option>
              </select>
            </label>
            {paymentNeedsDestination && <LightningDestinationField
              label="Destination Lightning"
              value={lightningDestination}
              onChange={setLightningDestination}
              optional
              compactHint="Optionnelle. Tu pourras aussi fournir une invoice BOLT11 ponctuelle au moment du payout."
            />}
            <button type="button" className="primary wide" onClick={buildResponse}>Créer ma réponse QR</button>
          </>}

          {mode === 'RESPONSE' && responseQr && <>
            <p>Montre ce QR à l’organisateur. Lorsqu’il le scanne, ton joueur est ajouté à sa partie sans qu’il ressaisisse tes informations.</p>
            <div className="party-join-qr"><QRCodeSVG value={responseQr} size={240} level="M" marginSize={2} /></div>
            <div className="party-join-game"><strong>{nickname.trim()}</strong><span>1re cave : {paymentChoiceLabel(preferredPayment)}</span></div>
            <p className="muted">Ce QR contient uniquement les informations de participation que tu viens de saisir. Aucune seed, clé privée ou autorisation wallet.</p>
          </>}

          {busy && <small>Ajout en cours…</small>}
        </div>
      </div>}
    </>
  );
}
