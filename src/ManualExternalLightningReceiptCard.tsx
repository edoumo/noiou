import { useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { LightningInvoice } from './lightning';
import { parseLightningDestination } from './lightningDestination';
import QrCameraScanner from './QrCameraScanner';
import { decodeQrImageFile } from './qrImageImport';
import './manualExternalLightning.css';

interface Props {
  request: LightningInvoice;
  onUseBolt11(invoice: string): void | Promise<void>;
  onConfirmReceived(): void | Promise<void>;
}

export default function ManualExternalLightningReceiptCard({ request, onUseBolt11, onConfirmReceived }: Props) {
  const [bolt11, setBolt11] = useState('');
  const [scanning, setScanning] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const parsed = useMemo(() => parseLightningDestination(request.request), [request.request]);
  const exactInvoiceReady = parsed.kind === 'BOLT11_INVOICE';
  const cameraAvailable = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
  const clipboardAvailable = typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.readText);

  async function applyBolt11(raw: string) {
    try {
      setBusy(true);
      setLocalError('');
      await onUseBolt11(raw);
      setBolt11('');
      setScanning(false);
      setAcknowledged(false);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setLocalError(detail.startsWith('Invoice refusée') ? detail : `Invoice refusée par NOIOU : ${detail}`);
    } finally {
      setBusy(false);
    }
  }

  async function importImage(file: File) {
    try { await applyBolt11(await decodeQrImageFile(file)); }
    catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setLocalError(`QR refusé par NOIOU : ${detail}`);
    }
  }

  async function pasteInvoice() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) throw new Error('Le presse-papiers est vide.');
      setBolt11(text.trim());
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Impossible de lire le presse-papiers.');
    }
  }

  async function confirm() {
    if (!acknowledged || !exactInvoiceReady) return;
    try {
      setBusy(true);
      setLocalError('');
      await onConfirmReceived();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="manual-receipt-card">
      <div className="manual-receipt-head">
        <div>
          <strong>{request.sats.toLocaleString('fr-FR')} sats à encaisser</strong>
          <small>NOIOU vérifie le montant avant d’autoriser le QR de paiement.</small>
        </div>
        <span className={`manual-badge ${exactInvoiceReady ? 'verified' : ''}`}>{exactInvoiceReady ? 'QR EXACT ✓' : 'À PRÉPARER'}</span>
      </div>

      {request.preparationError && !exactInvoiceReady && <div className="manual-preparation-warning" role="status">
        <strong>Préparation automatique impossible</strong>
        <span>{request.preparationError}</span>
        <small>Ce n’est pas un paiement refusé : fournis simplement une invoice BOLT11 du montant exact ci-dessous.</small>
      </div>}

      {exactInvoiceReady ? <>
        <div className="official-payment">
          <div className="official-payment-title">
            <span>QR officiel NOIOU</span>
            <strong>{request.sats.toLocaleString('fr-FR')} sats</strong>
          </div>
          {request.traceLabel && <small className="payment-trace">{request.traceLabel}</small>}
          <div className="invoice-qr" aria-label="QR Lightning exact validé par NOIOU">
            <QRCodeSVG value={request.request} size={220} level="M" marginSize={2} />
          </div>
          <p>Montre ce QR au joueur. Le montant est lié à l’invoice et a été contrôlé par NOIOU.</p>
        </div>

        <div className="receipt-confirmation-step">
          <strong>Après le paiement</strong>
          <p className="muted">NOIOU n’a pas accès au wallet externe. Vérifie l’arrivée des fonds avant de confirmer.</p>
          <label className="manual-confirm-check">
            <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
            J’ai vérifié dans le wallet de l’organisateur que les {request.sats.toLocaleString('fr-FR')} sats ont réellement été reçus.
          </label>
          <button type="button" className="primary" disabled={!acknowledged || busy} onClick={() => void confirm()}>
            Confirmer reçu · {request.sats.toLocaleString('fr-FR')} sats
          </button>
        </div>
      </> : <div className="manual-bolt11-entry">
        <strong>Préparer le QR exact</strong>
        <small>Dans le wallet de l’organisateur, génère une invoice de <b>{request.sats.toLocaleString('fr-FR')} sats</b>. NOIOU la refuse si le montant, le format ou le checksum ne correspondent pas.</small>
        {request.request && parsed.kind !== 'BOLT11_INVOICE' && <div className="manual-preparation-warning">
          <strong>Destination associée : {parsed.label}</strong>
          <span>Cette destination ne lie pas à elle seule le montant au QR. Une invoice BOLT11 exacte est requise pour ce paiement.</span>
        </div>}
        <div className="manual-bolt11-actions">
          <input
            value={bolt11}
            onChange={(event) => setBolt11(event.target.value)}
            placeholder="lnbc…"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <button type="button" disabled={!cameraAvailable || busy} onClick={() => setScanning(true)}>📷 Scanner</button>
          <button type="button" disabled={busy} onClick={() => imageInputRef.current?.click()}>🖼️ Photos</button>
          <button type="button" disabled={!clipboardAvailable || busy} onClick={() => void pasteInvoice()}>📋 Coller</button>
          <button type="button" className="primary" disabled={!bolt11.trim() || busy} onClick={() => void applyBolt11(bolt11)}>Vérifier et afficher le QR</button>
          <input ref={imageInputRef} hidden type="file" accept="image/*" onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = '';
            if (file) void importImage(file);
          }} />
        </div>
        {!cameraAvailable && <small>Caméra indisponible : utilise Photos, le presse-papiers ou colle l’invoice manuellement.</small>}
      </div>}

      {localError && <div className="invoice-rejected" role="alert">
        <strong>❌ Demande refusée</strong>
        <span>{localError}</span>
        <small>Corrige la demande puis réessaie ; inutile de rescanner la même invoice.</small>
      </div>}

      {scanning && <QrCameraScanner
        onDetected={(raw) => void applyBolt11(raw)}
        onCancel={() => setScanning(false)}
      />}
    </div>
  );
}
