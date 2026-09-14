import { useMemo, useState } from 'react';
import type { Currency } from './domain';
import { parseExactBolt11Invoice } from './manualExternalLightning';
import { buildManualLightningPayout } from './manualPayout';
import QrCameraScanner from './QrCameraScanner';

interface Props {
  label: string;
  destination?: string;
  amount: number;
  currency: Currency;
  lockedBtcFiatRate?: number;
  disabled?: boolean;
  onUseBolt11?(invoice: string): void;
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

function expectedSats(amount: number, currency: Currency, lockedBtcFiatRate?: number): number {
  if (currency === 'SATS') return Math.round(amount);
  if (!lockedBtcFiatRate || lockedBtcFiatRate <= 0) throw new Error('Taux BTC/fiat verrouillé manquant');
  return Math.round((amount / lockedBtcFiatRate) * 100_000_000);
}

export default function ManualLightningPayoutCard({
  label,
  destination,
  amount,
  currency,
  lockedBtcFiatRate,
  disabled = false,
  onUseBolt11,
  onConfirm,
}: Props) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [bolt11, setBolt11] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [invoiceError, setInvoiceError] = useState('');
  const sats = expectedSats(amount, currency, lockedBtcFiatRate);

  const instruction = useMemo(() => destination ? buildManualLightningPayout({
    label,
    destination,
    amount,
    currency,
    lockedBtcFiatRate,
  }) : null, [label, destination, amount, currency, lockedBtcFiatRate]);

  async function copy(text: string, message: string) {
    try {
      await copyWithFallback(text);
      setCopyStatus(message);
    } catch {
      setCopyStatus('Copie impossible sur ce navigateur.');
    }
  }

  function useBolt11(raw: string) {
    try {
      setInvoiceError('');
      const normalized = parseExactBolt11Invoice(raw, sats);
      onUseBolt11?.(normalized);
      setBolt11('');
      setScanOpen(false);
      setAcknowledged(false);
    } catch (error) {
      setInvoiceError(error instanceof Error ? error.message : String(error));
    }
  }

  const cameraAvailable = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

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
        <div><small>Bénéficiaire</small><strong>{label}</strong></div>
        <div><small>Montant exact</small><strong>{sats.toLocaleString('fr-FR')} sats</strong></div>
      </div>

      {instruction ? <>
        <div className="manual-payout-destination">
          <small>Destination Lightning</small>
          <code>{instruction.destination}</code>
        </div>
        <div className="actions">
          <button type="button" disabled={disabled} onClick={() => void copy(instruction.destination, 'Destination copiée.')}>Copier la destination</button>
          <button type="button" disabled={disabled} onClick={() => void copy(instruction.summary, 'Instruction complète copiée.')}>Copier l’instruction</button>
        </div>
      </> : <p className="muted">Aucune destination réutilisable enregistrée. Le bénéficiaire peut générer dans n’importe quel wallet Lightning une invoice BOLT11 de {sats.toLocaleString('fr-FR')} sats et te la faire scanner.</p>}

      {onUseBolt11 && <div className="manual-bolt11-entry">
        <strong>Invoice BOLT11 ponctuelle du bénéficiaire</strong>
        <small>Utile pour un wallet sans Lightning Address, BOLT12 ou LNURL réutilisable. NOIOU vérifie le montant avant de l’accepter.</small>
        <div className="manual-bolt11-actions">
          <input value={bolt11} onChange={(event) => setBolt11(event.target.value)} placeholder="lnbc…" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          <button type="button" disabled={!cameraAvailable || disabled} onClick={() => setScanOpen(true)}>📷 Scanner</button>
          <button type="button" disabled={!bolt11.trim() || disabled} onClick={() => useBolt11(bolt11)}>Utiliser cette invoice</button>
        </div>
        {invoiceError && <div className="alert" role="alert">{invoiceError}</div>}
      </div>}

      {copyStatus && <small className="copy-status">{copyStatus}</small>}

      <label className="check manual-payout-check">
        <input
          type="checkbox"
          checked={acknowledged}
          disabled={disabled || !destination}
          onChange={(event) => setAcknowledged(event.target.checked)}
        />
        J’ai effectué dans mon wallet le paiement de <strong>{sats.toLocaleString('fr-FR')} sats</strong> vers cette destination.
      </label>

      <button
        type="button"
        className="confirm-payment"
        disabled={disabled || !acknowledged || !destination}
        onClick={() => {
          onConfirm();
          setAcknowledged(false);
        }}
      >
        Confirmer ce payout dans NOIOU
      </button>

      {scanOpen && <QrCameraScanner onDetected={useBolt11} onCancel={() => setScanOpen(false)} />}
    </div>
  );
}
