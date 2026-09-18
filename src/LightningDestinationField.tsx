import { useMemo, useRef, useState } from 'react';
import { useI18n } from './i18n/provider';
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
  const { t } = useI18n();
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
    const unknownKeys = { QR: 'destField.detected.qrUnknown', image: 'destField.detected.imageUnknown', clipboard: 'destField.detected.clipboardUnknown' } as const;
    const labelKeys = { QR: 'destField.detected.label', image: 'destField.detected.labelFromImage', clipboard: 'destField.detected.labelFromClipboard' } as const;
    setScanMessage(detected.kind === 'UNKNOWN'
      ? t(unknownKeys[source])
      : t(labelKeys[source], { label: detected.label }));
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) throw new Error(t('error.clipboardEmpty'));
      applyDetected(text, 'clipboard');
    } catch (caught) {
      setScanMessage(caught instanceof Error ? caught.message : t('error.clipboardUnreadable'));
    }
  }

  async function importQrImage(file: File) {
    try {
      applyDetected(await decodeQrImageFile(file), 'image');
    } catch (caught) {
      setScanMessage(caught instanceof Error ? caught.message : t('error.qrNotFound'));
    }
  }

  return (
    <div className="lightning-destination-field">
      <label>{label}{optional ? t('destField.optional') : ''}
        <input
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setScanMessage('');
          }}
          placeholder={t('destField.placeholder')}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>
      <div className="destination-actions">
        <button type="button" disabled={!cameraAvailable} onClick={() => setScanning(true)}>{t('destField.scan')}</button>
        <button type="button" onClick={() => imageInputRef.current?.click()}>{t('destField.fromPhotos')}</button>
        <button type="button" disabled={!clipboardAvailable} onClick={() => void pasteFromClipboard()}>{t('destField.paste')}</button>
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
      {parsed.kind === 'BOLT11_INVOICE' && <div className="destination-warning destination-blocker" role="alert">
        <strong>{t('destField.bolt11.title')}</strong>
        <span>{t('destField.bolt11.note')}</span>
        <span><b>{t('destField.bolt11.action')}</b></span>
      </div>}
      {parsed.kind === 'BOLT12_OFFER' && <small className="destination-ok">{t('destField.bolt12.ok')}</small>}
      <details className="destination-help">
        <summary>{t('destField.help.summary')}</summary>
        {compactHint && <small className="destination-hint">{compactHint}</small>}
        <small className="destination-hint">{t('destField.help.samePhone')}</small>
        {!cameraAvailable && <small className="destination-hint">{t('destField.help.noCamera')}</small>}
      </details>
      {scanMessage && <small className="destination-hint">{scanMessage}</small>}
      {scanning && <QrCameraScanner onDetected={(raw) => applyDetected(raw, 'QR')} onCancel={() => setScanning(false)} />}
    </div>
  );
}
