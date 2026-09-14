import { useMemo, useRef, useState } from 'react';
import { parseLightningDestination } from './lightningDestination';
import QrCameraScanner from './QrCameraScanner';
import { decodeQrImageFile } from './qrImageImport';
import './lightningDestination.css';

interface Props {
  label: string;
  value: string;
  onChange(value: string): void;
  optional?: boolean;
  compactHint?: string;
}

export default function LightningDestinationField({ label, value, onChange, optional = false, compactHint }: Props) {
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const parsed = useMemo(() => parseLightningDestination(value), [value]);
  const cameraAvailable = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
  const clipboardAvailable = typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.readText);

  function applyDetected(raw: string, source: 'QR' | 'image' | 'clipboard') {
    const detected = parseLightningDestination(raw);
    onChange(detected.value || raw.trim());
    setScanning(false);
    setScanMessage(detected.kind === 'UNKNOWN'
      ? `${source === 'QR' ? 'QR lu' : source === 'image' ? 'Image lue' : 'Texte collé'}, mais le format Lightning n’est pas reconnu.`
      : `${detected.label} détecté${source === 'image' ? ' depuis l’image' : source === 'clipboard' ? ' depuis le presse-papiers' : ''}.`);
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) throw new Error('Le presse-papiers est vide.');
      applyDetected(text, 'clipboard');
    } catch (caught) {
      setScanMessage(caught instanceof Error ? caught.message : 'Impossible de lire le presse-papiers.');
    }
  }

  async function importQrImage(file: File) {
    try {
      applyDetected(await decodeQrImageFile(file), 'image');
    } catch (caught) {
      setScanMessage(caught instanceof Error ? caught.message : 'Impossible de lire ce QR.');
    }
  }

  return (
    <div className="lightning-destination-field">
      <label>{label}{optional ? ' (facultatif)' : ''}
        <input
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setScanMessage('');
          }}
          placeholder="alice@wallet.example, lno1… ou LNURL"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>
      <div className="destination-actions">
        <button type="button" disabled={!cameraAvailable} onClick={() => setScanning(true)}>📷 Scanner</button>
        <button type="button" onClick={() => imageInputRef.current?.click()}>🖼️ Depuis Photos</button>
        <button type="button" disabled={!clipboardAvailable} onClick={() => void pasteFromClipboard()}>📋 Coller</button>
        <input
          ref={imageInputRef}
          hidden
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = '';
            if (file) void importQrImage(file);
          }}
        />
        {value && <span className={`destination-kind ${parsed.reusable ? 'valid' : parsed.kind === 'BOLT11_INVOICE' ? 'warning' : 'unknown'}`}>{parsed.label}</span>}
      </div>
      {parsed.kind === 'BOLT11_INVOICE' && <small className="destination-warning">Invoice BOLT11 ponctuelle (`lnbc…`, `lntb…` ou `lnbcrt…`) : elle peut expirer et ne doit pas être enregistrée comme destination permanente.</small>}
      {parsed.kind === 'BOLT12_OFFER' && <small className="destination-ok">Offre BOLT12 réutilisable (`lno1…`).</small>}
      {compactHint && <small className="destination-hint">{compactHint}</small>}
      <small className="destination-hint">Même téléphone : copie la destination depuis ton wallet ou importe une capture du QR depuis Photos.</small>
      {!cameraAvailable && <small className="destination-hint">Caméra non disponible dans ce navigateur : utilise Photos, le presse-papiers ou la saisie manuelle.</small>}
      {scanMessage && <small className="destination-hint">{scanMessage}</small>}
      {scanning && <QrCameraScanner onDetected={(raw) => applyDetected(raw, 'QR')} onCancel={() => setScanning(false)} />}
    </div>
  );
}
