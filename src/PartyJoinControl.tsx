import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useI18n } from './i18n/provider';
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

const POST_RELOAD_SCROLL_KEY = 'noiou.post-reload-scroll-target.v1';

type Mode = 'CLOSED' | 'ORGANIZER' | 'SCAN_INVITE' | 'SCAN_RESPONSE' | 'PARTICIPANT' | 'RESPONSE';

export default function PartyJoinControl() {
  const { t, formatNumber } = useI18n();
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
      setError(caught instanceof Error ? caught.message : t('error.partyQrInvalid'));
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
      if (!snapshot?.game || snapshot.game.status !== 'OPEN') throw new Error(t('error.partyQrConfigureFirst'));
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
      if (!snapshot?.game || snapshot.game.status !== 'OPEN') throw new Error(t('error.partyNoOpenGame'));
      if (response.gameId !== snapshot.game.id) throw new Error(t('error.partyOtherGame'));
      if (!await verifyLedger(snapshot.ledger)) throw new Error(t('error.partyLedgerInvalid'));
      if (snapshot.players.some((player) => player.nickname.toLocaleLowerCase() === response.nickname.toLocaleLowerCase())) throw new Error(t('error.partyNicknameTaken'));

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
      window.sessionStorage.setItem(POST_RELOAD_SCROLL_KEY, JSON.stringify({
        gameId: snapshot.game.id,
        playerId: player.id,
      }));
      if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
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
    ? `${t('join.inviteTerms', { currency: invite.currency, amount: formatNumber(invite.buyInAmount) })}${invite.chipsPerBuyIn ? t('join.inviteTerms.chips', { chips: formatNumber(invite.chipsPerBuyIn) }) : ''}`
    : '';

  return (
    <>
      <div className="party-join-launcher">
        <button type="button" onClick={openOrganizer}>{t('join.launcher.qr')}</button>
        <button type="button" onClick={() => { setError(''); setMode('SCAN_INVITE'); }}>{t('join.launcher.join')}</button>
      </div>

      {mode !== 'CLOSED' && <div className="party-join-backdrop" role="dialog" aria-modal="true">
        <div className="party-join-panel">
          <div className="party-join-head">
            <div><strong>{mode === 'PARTICIPANT' || mode === 'RESPONSE' || mode === 'SCAN_INVITE' ? t('join.header.join') : t('join.header.invite')}</strong><small>{t('join.header.subtitle')}</small></div>
            <button type="button" onClick={close}>{t('join.close')}</button>
          </div>

          {error && <div className="alert" role="alert">{error}</div>}

          {mode === 'ORGANIZER' && inviteUrl && <>
            <p>{t('join.organizer.instructions')}</p>
            <div className="party-join-qr"><QRCodeSVG value={inviteUrl} size={240} level="M" marginSize={2} /></div>
            <small className="party-join-summary">{inviteTerms}</small>
            <div className="party-join-actions">
              <button type="button" onClick={() => setMode('SCAN_RESPONSE')}>{t('join.organizer.scanResponse')}</button>
              <button type="button" onClick={() => responseImageRef.current?.click()}>{t('join.organizer.responseFromPhotos')}</button>
              <input ref={responseImageRef} hidden type="file" accept="image/*" onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = '';
                if (file) void importResponseImage(file);
              }} />
            </div>
            <p className="muted">{t('join.organizer.noBackend')}</p>
          </>}

          {mode === 'ORGANIZER' && !inviteUrl && <p className="muted">{error || t('join.organizer.noGame')}</p>}

          {mode === 'SCAN_INVITE' && <>
            <p>{t('join.scanInvite.instructions')}</p>
            <div className="party-join-actions"><button type="button" onClick={() => inviteImageRef.current?.click()}>{t('join.scanInvite.fromPhotos')}</button></div>
            <input ref={inviteImageRef} hidden type="file" accept="image/*" onChange={(event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = '';
              if (file) void importInviteImage(file);
            }} />
            <QrCameraScanner onDetected={applyInvite} onCancel={close} />
          </>}

          {mode === 'SCAN_RESPONSE' && <>
            <p>{t('join.scanResponse.instructions')}</p>
            <QrCameraScanner onDetected={(raw) => void acceptResponse(raw)} onCancel={() => setMode('ORGANIZER')} />
          </>}

          {mode === 'PARTICIPANT' && invite && <>
            <div className="party-join-game"><strong>{t('join.participant.found')}</strong><span>{inviteTerms}</span></div>
            <p className="muted">{t('join.participant.checkTerms')}</p>
            <label>{t('player.nickname')}<input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Alice" /></label>
            <label>{t('player.firstBuyInPayment')}
              <select value={preferredPayment} onChange={(event) => setPreferredPayment(event.target.value as PaymentMethod | 'ANY')}>
                <option value="CASH">{t('common.cash')}</option>
                <option value="LIGHTNING">{t('common.lightning')}</option>
                <option value="ANY">{t('player.payment.any')}</option>
              </select>
            </label>
            {paymentNeedsDestination && <LightningDestinationField
              label={t('player.destination')}
              value={lightningDestination}
              onChange={setLightningDestination}
              optional
              compactHint={t('join.participant.destinationHint')}
            />}
            <button type="button" className="primary wide" onClick={buildResponse}>{t('join.participant.buildResponse')}</button>
          </>}

          {mode === 'RESPONSE' && responseQr && <>
            <p>{t('join.response.instructions')}</p>
            <div className="party-join-qr"><QRCodeSVG value={responseQr} size={240} level="M" marginSize={2} /></div>
            <div className="party-join-game"><strong>{nickname.trim()}</strong><span>{t('join.response.terms', { method: paymentChoiceLabel(preferredPayment) })}</span></div>
            <p className="muted">{t('join.response.privacy')}</p>
          </>}

          {busy && <small>{t('join.busy')}</small>}
        </div>
      </div>}
    </>
  );
}
