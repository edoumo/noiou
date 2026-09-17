import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isPlayStarted, MIN_POKER_PLAYERS } from './lobby';
import { buyInAttentionState, firstOutstandingBuyInPlayerId } from './lobbyGuidance';
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
        <strong>{players.length} joueurs ajoutés</strong>
        <small className="lobby-roster-names">{players.map((player) => player.nickname).join(' · ')}</small>
        <small>Quand la table est prête, passe aux caves. Tu pourras encore ajouter quelqu’un ensuite si nécessaire.</small>
        <button type="button" className="primary wide" onClick={moveToCollections}>✓ Tous les joueurs sont ajoutés — Passer aux caves</button>
      </div>;
    }

    if ((!playStarted && rosterReady) || playStarted) {
      if (editingPlayers) {
        return <div className="lobby-director compact" aria-live="polite">
          <small>{playStarted ? 'Ajoute le nouveau joueur puis NOIOU reviendra automatiquement à sa cave.' : 'Ajoute un joueur si nécessaire, puis reviens aux caves.'}</small>
          <button type="button" onClick={closePlayerEditor}>↩ Replier l’ajout de joueur</button>
        </div>;
      }
      return <div className="lobby-director compact" aria-live="polite">
        <strong>{playStarted ? 'Table en cours' : 'Liste des joueurs prête'}</strong>
        <small>{playStarted ? 'L’ajout reste disponible sans encombrer la partie.' : 'Les joueurs qui nécessitent encore une action sont surlignés ci-dessous.'}</small>
        <button type="button" onClick={openPlayerEditor}>{playStarted ? '＋ Ajouter un joueur en cours de partie' : '＋ Ajouter un autre joueur'}</button>
      </div>;
    }

    return null;
  })();

  return control ? createPortal(control, portalTarget) : null;
}
