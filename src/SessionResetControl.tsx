import { useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
import { useI18n } from './i18n/provider';
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
  const { t } = useI18n();
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
      <button type="button" className="new-game-fab" onClick={askReset}>{t('reset.fab')}</button>
      <ConfirmDialog
        open={confirming}
        title={t('dialog.reset.title')}
        message={t('dialog.reset.message', { label: label ? t('dialog.reset.label', { label }) : '' })}
        confirmLabel={t('dialog.reset.confirm')}
        onCancel={() => setConfirming(false)}
        onConfirm={reset}
      />
    </>
  );
}
