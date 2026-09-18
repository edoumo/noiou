import { useRef, useState, type MouseEvent, type ReactNode } from 'react';
import ConfirmDialog from './ConfirmDialog';
import { useI18n } from './i18n/provider';
import { loadSession } from './session';
import { t as translate } from './i18n';

import { t } from './i18n';

/**
 * The buy-in confirmation boundary intercepts the cash button before it runs.
 * The button label is translated, so the match is done against the localized
 * value in every embedded catalog rather than a hardcoded French string.
 */
function isCashBuyInButton(button: HTMLButtonElement): boolean {
  const text = button.textContent?.trim() ?? '';
  if (!text) return false;
  return text === t('buyin.cash_received');
}

interface Props { children: ReactNode }

function currentBuyInLabel(): string {
  if (typeof window === 'undefined') return translate('dialog.currentBuyIn');
  try {
    const game = loadSession(window.localStorage)?.game;
    if (!game) return translate('dialog.currentBuyIn');
    if (game.currency === 'SATS') return `${Math.round(game.buyInAmount).toLocaleString('fr-FR')} sats`;
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: game.currency }).format(game.buyInAmount);
  } catch {
    return translate('dialog.currentBuyIn');
  }
}

export default function CashBuyInConfirmationBoundary({ children }: Props) {
  const { t } = useI18n();
  const [pendingButton, setPendingButton] = useState<HTMLButtonElement | null>(null);
  const [message, setMessage] = useState('');
  const bypass = useRef(false);

  function capture(event: MouseEvent<HTMLDivElement>) {
    const button = (event.target as HTMLElement).closest('button');
    if (!button || !isCashBuyInButton(button)) return;
    if (bypass.current) {
      bypass.current = false;
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const nickname = button.closest('.player-box')?.querySelector('.player-heading strong')?.textContent?.trim() || t('common.unknownPlayer');
    setMessage(t('dialog.cashBuyIn.message', { amount: currentBuyInLabel(), player: nickname }));
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
        title={t('dialog.cashBuyIn.title')}
        message={message}
        confirmLabel={t('dialog.cashBuyIn.confirm')}
        onCancel={() => setPendingButton(null)}
        onConfirm={confirm}
      />
    </>
  );
}
