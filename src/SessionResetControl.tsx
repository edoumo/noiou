import { useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
import { clearSession, loadSession } from './session';

function activeGameLabel(): string {
  if (typeof window === 'undefined') return '';
  try {
    const snapshot = loadSession(window.localStorage);
    if (!snapshot?.game) return '';
    return `${snapshot.game.status} · ${snapshot.game.currency}`;
  } catch {
    return 'session locale';
  }
}

export default function SessionResetControl() {
  const [confirming, setConfirming] = useState(false);
  const [label, setLabel] = useState('');

  function askReset() {
    setLabel(activeGameLabel());
    setConfirming(true);
  }

  function reset() {
    if (typeof window === 'undefined') return;
    clearSession(window.localStorage);
    // Theme, language, sounds/haptics and other application preferences use separate keys.
    window.location.reload();
  }

  return (
    <>
      <button type="button" className="new-game-fab" onClick={askReset}>＋ Nouvelle partie</button>
      <ConfirmDialog
        open={confirming}
        title="Réinitialiser la partie ?"
        message={`La partie${label ? ` (${label})` : ''} sera effacée de ce téléphone. Les réglages de l’application (langue, thème, sons, vibrations) seront conservés.`}
        confirmLabel="Effacer et recommencer"
        onCancel={() => setConfirming(false)}
        onConfirm={reset}
      />
    </>
  );
}
