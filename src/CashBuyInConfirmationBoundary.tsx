import { useRef, useState, type MouseEvent, type ReactNode } from 'react';
import ConfirmDialog from './ConfirmDialog';
import { loadSession } from './session';

interface Props { children: ReactNode }

function currentBuyInLabel(): string {
  if (typeof window === 'undefined') return 'la cave';
  try {
    const game = loadSession(window.localStorage)?.game;
    if (!game) return 'la cave';
    if (game.currency === 'SATS') return `${Math.round(game.buyInAmount).toLocaleString('fr-FR')} sats`;
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: game.currency }).format(game.buyInAmount);
  } catch {
    return 'la cave';
  }
}

export default function CashBuyInConfirmationBoundary({ children }: Props) {
  const [pendingButton, setPendingButton] = useState<HTMLButtonElement | null>(null);
  const [message, setMessage] = useState('');
  const bypass = useRef(false);

  function capture(event: MouseEvent<HTMLDivElement>) {
    const button = (event.target as HTMLElement).closest('button');
    if (!button || button.textContent?.trim() !== 'Cave espèces reçues') return;
    if (bypass.current) {
      bypass.current = false;
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const nickname = button.closest('.player-box')?.querySelector('.player-heading strong')?.textContent?.trim() || 'ce joueur';
    setMessage(`Confirmer l’encaissement en espèces de ${currentBuyInLabel()} pour ${nickname} ?`);
    setPendingButton(button);
  }

  function confirm() {
    const button = pendingButton;
    setPendingButton(null);
    if (!button) return;
    bypass.current = true;
    button.click();
  }

  return (
    <>
      <div onClickCapture={capture}>{children}</div>
      <ConfirmDialog
        open={Boolean(pendingButton)}
        title="Confirmer la cave espèces"
        message={message}
        confirmLabel="Confirmer l’encaissement"
        onCancel={() => setPendingButton(null)}
        onConfirm={confirm}
      />
    </>
  );
}
