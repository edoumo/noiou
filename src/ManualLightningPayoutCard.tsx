import { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { Currency } from './domain';
import { parseLightningDestination } from './lightningDestination';
import { requestExactInvoiceFromReusableDestination } from './lnurlPay';
import { parseExactBolt11Invoice } from './manualExternalLightning';
import QrCameraScanner from './QrCameraScanner';
import { decodeQrImageFile } from './qrImageImport';

interface Props {
  label: string;
  destination?: string;
  amount: number;
  currency: Currency;
  lockedBtcFiatRate?: number;
  disabled?: boolean;
  traceLabel?: string;
  onUseBolt11?(invoice: string): void | Promise<void>;
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
  traceLabel,
  onUseBolt11,
  onConfirm,
}: Props) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [bolt11, setBolt11] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [invoiceError, setInvoiceError] = useState('');
  const [resolvedInvoice, setResolvedInvoice] = useState('');
  const [preparing, setPreparing] = useState(false);
  const autoAttemptRef = useRef('');
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const sats = expectedSats(amount, currency, lockedBtcFiatRate);
  const parsedDestination = useMemo(() => parseLightningDestination(destination ?? ''), [destination]);
  const effectiveInvoice = parsedDestination.kind === 'BOLT11_INVOICE' ? parsedDestination.value : resolvedInvoice;
  const exactReady = Boolean(effectiveInvoice);

  async function copy(text: string, message: string) {
    try {
      await copyWithFallback(text);
      setCopyStatus(message);
    } catch {
      setCopyStatus('Copie impossible sur ce navigateur.');
    }
  }

  async function useBolt11(raw: string) {
    try {
      setInvoiceError('');
      const normalized = parseExactBolt11Invoice(raw, sats);
      setResolvedInvoice(normalized);
      await onUseBolt11?.(normalized);
      setBolt11('');
      setScanOpen(false);
      setAcknowledged(false);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setInvoiceError(detail.startsWith('Invoice refusée') ? detail : `Invoice refusée par NOIOU : ${detail}`);
    }
  }

  useEffect(() => {
    if (disabled || exactReady || preparing || !destination) return;
    if (parsedDestination.kind !== 'LIGHTNING_ADDRESS' && parsedDestination.kind !== 'LNURL') return;
    const key = `${destination}|${sats}|${traceLabel ?? label}`;
    if (autoAttemptRef.current === key) return;
    autoAttemptRef.current = key;
    setPreparing(true);
    setInvoiceError('');
    void requestExactInvoiceFromReusableDestination(destination, sats, traceLabel ?? `NOIOU ${label}`)
      .then((result) => useBolt11(result.invoice))
      .catch((error) => {
        const detail = error instanceof Error ? error.message : String(error);
        setInvoiceError(`Préparation automatique impossible : ${detail}`);
      })
      .finally(() => setPreparing(false));
  }, [destination, disabled, exactReady, label, parsedDestination.kind, preparing, sats, traceLabel]);

  async function importImage(file: File) {
    try { await useBolt11(await decodeQrImageFile(file)); }
    catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setInvoiceError(`QR refusé par NOIOU : ${detail}`);
    }
  }

  async function pasteInvoice() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) throw new Error('Le presse-papiers est vide.');
      setBolt11(text.trim());
    } catch (error) {
      setInvoiceError(error instanceof Error ? error.message : 'Impossible de lire le presse-papiers.');
    }
  }

  const cameraAvailable = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
  const clipboardAvailable = typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.readText);

  return (
    <div className="manual-payout">
      <div className="manual-payout-head">
        <div>
          <strong>Régler {label}</strong>
          <small>NOIOU contrôle le montant. Le paiement lui-même reste effectué par l’organisateur dans son wallet.</small>
        </div>
        <span className="state pending">{exactReady ? 'QR EXACT ✓' : 'À PRÉPARER'}</span>
      </div>

      <div className="manual-payout-grid">
        <div><small>Bénéficiaire</small><strong>{label}</strong></div>
        <div><small>Montant exact</small><strong>{sats.toLocaleString('fr-FR')} sats</strong></div>
      </div>

      {exactReady ? <div className="official-payment payout-official-payment">
        <div className="official-payment-title"><span>QR officiel NOIOU</span><strong>{sats.toLocaleString('fr-FR')} sats</strong></div>
        {traceLabel && <small className="payment-trace">{traceLabel}</small>}
        <div className="invoice-qr" aria-label={`QR Lightning exact pour ${label}`}>
          <QRCodeSVG value={effectiveInvoice} size={220} level="M" marginSize={2} />
        </div>
        <div className="actions">
          <a className="button-link primary" href={`lightning:${effectiveInvoice}`}>⚡ Ouvrir dans mon wallet</a>
          <button type="button" disabled={disabled} onClick={() => void copy(effectiveInvoice, 'Invoice copiée.')}>📋 Copier l’invoice</button>
        </div>
        <small>Le montant de cette invoice a été vérifié localement par NOIOU avant affichage.</small>
      </div> : <div className="manual-bolt11-entry">
        {preparing && <div className="manual-preparation-warning" role="status"><strong>Préparation du QR exact…</strong><span>NOIOU demande au service Lightning une invoice de {sats.toLocaleString('fr-FR')} sats.</span></div>}
        {destination && !preparing && <div className="manual-preparation-warning">
          <strong>Destination associée : {parsedDestination.label}</strong>
          <span>{parsedDestination.kind === 'BOLT12_OFFER'
            ? 'L’offre est réutilisable, mais NOIOU ne peut pas encore en dériver lui-même une invoice liée au montant. Demande une BOLT11 exacte au bénéficiaire.'
            : parsedDestination.kind === 'LIGHTNING_ADDRESS' || parsedDestination.kind === 'LNURL'
              ? 'La préparation automatique a été tentée. Si elle échoue, utilise le fallback BOLT11 exact.'
              : 'Une invoice BOLT11 exacte est nécessaire pour sécuriser le montant.'}</span>
        </div>}
        {!destination && <p className="muted">Le bénéficiaire doit générer une invoice BOLT11 de {sats.toLocaleString('fr-FR')} sats.</p>}
        <strong>Fallback universel : invoice BOLT11 exacte</strong>
        <small>Scanne, importe ou colle l’invoice fournie par le bénéficiaire. Une autre valeur sera refusée avec la raison.</small>
        <div className="manual-bolt11-actions">
          <input value={bolt11} onChange={(event) => setBolt11(event.target.value)} placeholder="lnbc…" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          <button type="button" disabled={!cameraAvailable || disabled} onClick={() => setScanOpen(true)}>📷 Scanner</button>
          <button type="button" disabled={disabled} onClick={() => imageInputRef.current?.click()}>🖼️ Photos</button>
          <button type="button" disabled={!clipboardAvailable || disabled} onClick={() => void pasteInvoice()}>📋 Coller</button>
          <button type="button" className="primary" disabled={!bolt11.trim() || disabled} onClick={() => void useBolt11(bolt11)}>Vérifier et afficher le QR</button>
          <input ref={imageInputRef} hidden type="file" accept="image/*" onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = '';
            if (file) void importImage(file);
          }} />
        </div>
      </div>}

      {invoiceError && <div className="invoice-rejected" role="alert"><strong>❌ Demande refusée / non préparée</strong><span>{invoiceError}</span><small>Le paiement n’est pas confirmé. Corrige la demande ou utilise une invoice BOLT11 exacte.</small></div>}
      {copyStatus && <small className="copy-status">{copyStatus}</small>}

      {exactReady && <>
        <label className="check manual-payout-check">
          <input
            type="checkbox"
            checked={acknowledged}
            disabled={disabled}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          J’ai effectué dans mon wallet le paiement de <strong>{sats.toLocaleString('fr-FR')} sats</strong> avec cette demande contrôlée par NOIOU.
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
          Confirmer payé · {sats.toLocaleString('fr-FR')} sats
        </button>
      </>}

      {scanOpen && <QrCameraScanner onDetected={(raw) => void useBolt11(raw)} onCancel={() => setScanOpen(false)} />}
    </div>
  );
}
