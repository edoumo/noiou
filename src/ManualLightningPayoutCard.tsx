import { useMemo, useState } from 'react';
import type { Currency } from './domain';
import { buildManualLightningPayout } from './manualPayout';

interface Props {
  label: string;
  destination: string;
  amount: number;
  currency: Currency;
  lockedBtcFiatRate?: number;
  disabled?: boolean;
  onConfirm(): void;
}

function copyWithFallback(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  if (typeof document === 'undefined') return Promise.reject(new Error('Copie indisponible'));
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  return copied ? Promise.resolve() : Promise.reject(new Error('Copie indisponible'));
}

export default function ManualLightningPayoutCard({
  label,
  destination,
  amount,
  currency,
  lockedBtcFiatRate,
  disabled = false,
  onConfirm,
}: Props) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');

  const instruction = useMemo(() => buildManualLightningPayout({
    label,
    destination,
    amount,
    currency,
    lockedBtcFiatRate,
  }), [label, destination, amount, currency, lockedBtcFiatRate]);

  async function copy(text: string, message: string) {
    try {
      await copyWithFallback(text);
      setCopyStatus(message);
    } catch {
      setCopyStatus('Copie impossible sur ce navigateur.');
    }
  }

  return (
    <div className="manual-payout">
      <div className="manual-payout-head">
        <div>
          <strong>Paiement Lightning manuel</strong>
          <small>NOIOU ne dépense aucun sat. Effectue ce paiement dans ton wallet, puis confirme ici.</small>
        </div>
        <span className="state pending">À PAYER</span>
      </div>

      <div className="manual-payout-grid">
        <div><small>Bénéficiaire</small><strong>{instruction.label}</strong></div>
        <div><small>Montant exact</small><strong>{instruction.sats.toLocaleString('fr-FR')} sats</strong></div>
      </div>

      <div className="manual-payout-destination">
        <small>Destination Lightning</small>
        <code>{instruction.destination}</code>
      </div>

      <div className="actions">
        <button type="button" disabled={disabled} onClick={() => void copy(instruction.destination, 'Destination copiée.')}>Copier la destination</button>
        <button type="button" disabled={disabled} onClick={() => void copy(instruction.summary, 'Instruction complète copiée.')}>Copier l’instruction</button>
      </div>
      {copyStatus && <small className="copy-status">{copyStatus}</small>}

      <label className="check manual-payout-check">
        <input
          type="checkbox"
          checked={acknowledged}
          disabled={disabled}
          onChange={(event) => setAcknowledged(event.target.checked)}
        />
        J’ai effectué dans mon wallet le paiement de <strong>{instruction.sats.toLocaleString('fr-FR')} sats</strong> vers cette destination.
      </label>

      <button
        type="button"
        className="confirm-payment"
        disabled={disabled || !acknowledged}
        onClick={() => {
          onConfirm();
          setAcknowledged(false);
        }}
      >
        Confirmer ce payout dans NOIOU
      </button>
    </div>
  );
}
