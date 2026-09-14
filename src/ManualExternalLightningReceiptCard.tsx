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
  const isBolt11 = parsed.kind === 'BOLT11_INVOICE';
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
      setLocalError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function importImage(file: File) {
    try { await applyBolt11(await decodeQrImageFile(file)); }
    catch (error) { setLocalError(error instanceof Error ? error.message : String(error)); }
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
    if (!acknowledged) return;
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
          <strong>{request.sats.toLocaleString('fr-FR')} sats à recevoir</strong>
          <small>Wallet externe · confirmation manuelle par l’organisateur</small>
        </div>
        <span className="manual-badge">{isBolt11 ? 'BOLT11 exact' : request.request ? parsed.label : 'Invoice requise'}</span>
      </div>

      {request.request ? <div className="manual-request-grid">
        <div className="invoice-qr" aria-label="QR Lightning pour encaissement externe">
          <QRCodeSVG value={request.request} size={180} level="M" marginSize={2} />
        </div>
        <div className="manual-request-copy">
          <small>{isBolt11
            ? 'Invoice ponctuelle validée localement au montant exact.'
            : 'Destination réutilisable. Le payeur doit envoyer exactement le montant affiché. Si le wallet ne le permet pas, génère une invoice BOLT11 ci-dessous.'}</small>
          <code>{request.request}</code>
        </div>
      </div> : <p className="muted">Aucune destination réutilisable n’a été enregistrée pour l’organisateur. Génère une invoice du montant exact dans ton wallet Lightning, puis scanne-la, importe sa capture ou colle-la ici.</p>}

      <div className="manual-bolt11-entry">
        <strong>{request.request && !isBolt11 ? 'Option universelle : invoice BOLT11 ponctuelle' : 'Invoice BOLT11 du wallet organisateur'}</strong>
        <small>Compatible avec les wallets qui savent générer une invoice Lightning, sans exiger d’adresse en @, de BOLT12 ni de NWC.</small>
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
          <button type="button" disabled={!bolt11.trim() || busy} onClick={() => void applyBolt11(bolt11)}>Valider l’invoice</button>
          <input ref={imageInputRef} hidden type="file" accept="image/*" onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = '';
            if (file) void importImage(file);
          }} />
        </div>
        {!cameraAvailable && <small>Caméra indisponible : utilise Photos, le presse-papiers ou colle l’invoice manuellement.</small>}
      </div>

      {localError && <div className="alert" role="alert">{localError}</div>}

      <label className="manual-confirm-check">
        <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
        J’ai vérifié dans le wallet de l’organisateur que les {request.sats.toLocaleString('fr-FR')} sats ont réellement été reçus.
      </label>
      <button type="button" className="primary" disabled={!acknowledged || !request.request || busy} onClick={() => void confirm()}>
        Confirmer l’encaissement Lightning
      </button>

      {scanning && <QrCameraScanner
        onDetected={(raw) => void applyBolt11(raw)}
        onCancel={() => setScanning(false)}
      />}
    </div>
  );
}
