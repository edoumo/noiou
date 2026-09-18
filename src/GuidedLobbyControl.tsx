import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from './i18n/provider';
import { isPlayStarted, MIN_POKER_PLAYERS } from './lobby';
import { buyInAttentionState, firstOutstandingBuyInPlayerId } from './lobbyGuidance';
import { readPageOrigin, startPendingJoinLanding } from './joinLanding';
import {
  loadSession,
  SESSION_CLEARED_EVENT,
  SESSION_SAVED_EVENT,
  type SessionSnapshot,
} from './session';

const LOBBY_ROSTER_READY_KEY = 'noiou.lobby-roster-ready.v1';

type LobbyPhase = 'players' | 'collections' | 'collections-edit' | 'play-collapsed' | 'play-edit';

function readSnapshot(): SessionSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    return loadSession(window.localStorage);
  } catch {
    return null;
  }
}

function readReadyGameId(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(LOBBY_ROSTER_READY_KEY) ?? '';
}

function storeReadyGameId(gameId: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOBBY_ROSTER_READY_KEY, gameId);
}

function scrollToTarget(id: string) {
  if (typeof document === 'undefined') return;
  window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}

export default function GuidedLobbyControl() {
  const { t } = useI18n();
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(() => readSnapshot());
  const [readyGameId, setReadyGameId] = useState(() => readReadyGameId());
  const [editingPlayers, setEditingPlayers] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const previousPlayerCount = useRef(snapshot?.players.length ?? 0);
  const previousGameId = useRef(snapshot?.game?.id ?? '');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const refresh = () => setSnapshot(readSnapshot());
    window.addEventListener(SESSION_SAVED_EVENT, refresh);
    window.addEventListener(SESSION_CLEARED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(SESSION_SAVED_EVENT, refresh);
      window.removeEventListener(SESSION_CLEARED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const game = snapshot?.game ?? null;
  const players = snapshot?.players ?? [];
  const contributions = snapshot?.contributions ?? [];
  const playStarted = Boolean(game && isPlayStarted(game));
  const legacyCollectionFlow = Boolean(
    game
    && game.status === 'OPEN'
    && !playStarted
    && players.length >= MIN_POKER_PLAYERS
    && contributions.length > 0,
  );
  const rosterReady = Boolean(
    game
    && !playStarted
    && players.length >= MIN_POKER_PLAYERS
    && (readyGameId === game.id || legacyCollectionFlow),
  );

  let phase: LobbyPhase | null = null;
  if (game?.status === 'OPEN') {
    if (playStarted) phase = editingPlayers ? 'play-edit' : 'play-collapsed';
    else if (rosterReady) phase = editingPlayers ? 'collections-edit' : 'collections';
    else phase = 'players';
  }

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (phase) root.dataset.noiouLobbyPhase = phase;
    else delete root.dataset.noiouLobbyPhase;

    document.querySelectorAll<HTMLElement>('.player-box').forEach((element) => {
      element.classList.remove('collection-action-required', 'collection-action-pending');
    });

    const shouldHighlight = phase === 'collections' || phase === 'collections-edit' || phase === 'play-collapsed' || phase === 'play-edit';
    if (shouldHighlight) {
      for (const player of players) {
        const element = document.getElementById(`player-${player.id}`);
        if (!element) continue;
        const state = buyInAttentionState(player.id, contributions);
        if (state === 'REQUIRED') element.classList.add('collection-action-required');
        if (state === 'PENDING') element.classList.add('collection-action-pending');
      }
    }

    return () => {
      document.querySelectorAll<HTMLElement>('.player-box').forEach((element) => {
        element.classList.remove('collection-action-required', 'collection-action-pending');
      });
    };
  }, [phase, players, contributions]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const frame = window.requestAnimationFrame(() => setPortalTarget(document.getElementById('add-player')));
    return () => window.cancelAnimationFrame(frame);
  }, [game?.id, players.length, phase]);

  useEffect(() => {
    const gameId = game?.id ?? '';
    if (gameId !== previousGameId.current) {
      previousGameId.current = gameId;
      previousPlayerCount.current = players.length;
      setEditingPlayers(false);
      return;
    }

    const playerAdded = players.length > previousPlayerCount.current;
    if (playerAdded && game?.status === 'OPEN') {
      const newestPlayer = players[players.length - 1];
      setEditingPlayers(false);

      if (!playStarted && !rosterReady) {
        scrollToTarget('add-player');
      } else {
        if (!playStarted) {
          storeReadyGameId(game.id);
          setReadyGameId(game.id);
        }
        if (newestPlayer) scrollToTarget(`player-${newestPlayer.id}`);
      }
    }
    previousPlayerCount.current = players.length;
  }, [game?.id, game?.status, players, playStarted, rosterReady]);

  // UX26-F1: consume the one-shot landing target written by the QR join flow (PartyJoinControl
  // acceptResponse) before its reload. Runs once per page boot; the helper waits over animation
  // frames until the exact card is rendered, scrolls to it, then clears the key so no later
  // render, manual refresh or other player addition can replay the landing.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const stored = readSnapshot();
    const roster = stored?.game?.status === 'OPEN' ? stored.players : [];
    startPendingJoinLanding({
      storage: window.sessionStorage,
      roster,
      pageOrigin: readPageOrigin(),
      findElement: (domId) => {
        const element = document.getElementById(domId);
        if (!element || element.getClientRects().length === 0) return null;
        return element;
      },
      requestFrame: (callback) => { window.requestAnimationFrame(callback); },
    });
    // Note: window.history.scrollRestoration intentionally stays 'manual' for the rest of this
    // boot document once a join landing was pending (the guard set it before React mounted).
    // This prevents any late browser restoration from fighting the one-shot landing scroll.
    // Each later navigation starts a fresh document where the guard re-evaluates from scratch.
  }, []);

  if (!game || game.status !== 'OPEN' || !portalTarget) return null;

  function moveToCollections() {
    storeReadyGameId(game!.id);
    setReadyGameId(game!.id);
    setEditingPlayers(false);
    const nextPlayerId = firstOutstandingBuyInPlayerId(players, contributions);
    scrollToTarget(nextPlayerId ? `player-${nextPlayerId}` : 'workflow-guide');
  }

  function openPlayerEditor() {
    setEditingPlayers(true);
    scrollToTarget('add-player');
  }

  function closePlayerEditor() {
    setEditingPlayers(false);
    if (!playStarted) {
      storeReadyGameId(game!.id);
      setReadyGameId(game!.id);
      const nextPlayerId = firstOutstandingBuyInPlayerId(players, contributions);
      scrollToTarget(nextPlayerId ? `player-${nextPlayerId}` : 'workflow-guide');
    } else {
      scrollToTarget('collections');
    }
  }

  const control = (() => {
    if (!playStarted && !rosterReady && players.length >= MIN_POKER_PLAYERS) {
      return <div className="lobby-director" aria-live="polite">
        <strong>{t('lobby.playersAdded', { count: players.length })}</strong>
        <small className="lobby-roster-names">{players.map((player) => player.nickname).join(' · ')}</small>
        <small>{t('lobby.rosterNote')}</small>
        <button type="button" className="primary wide" onClick={moveToCollections}>{t('lobby.moveToCollections')}</button>
      </div>;
    }

    if ((!playStarted && rosterReady) || playStarted) {
      if (editingPlayers) {
        return <div className="lobby-director compact" aria-live="polite">
          <small>{playStarted ? t('lobby.editPlayingNote') : t('lobby.editNote')}</small>
          <button type="button" onClick={closePlayerEditor}>{t('lobby.collapseEditor')}</button>
        </div>;
      }
      return <div className="lobby-director compact" aria-live="polite">
        <strong>{playStarted ? t('lobby.tableRunning') : t('lobby.rosterReady')}</strong>
        <small>{playStarted ? t('lobby.tableRunningNote') : t('lobby.highlightNote')}</small>
        <button type="button" onClick={openPlayerEditor}>{playStarted ? t('lobby.addInGame') : t('lobby.addAnother')}</button>
      </div>;
    }

    return null;
  })();

  return control ? createPortal(control, portalTarget) : null;
}
