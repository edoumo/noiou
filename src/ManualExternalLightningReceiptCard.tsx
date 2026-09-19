import { useMemo, useRef, useState } from 'react';
import { useI18n } from './i18n/provider';
import type { LightningInvoice } from './lightning';
import { parseLightningDestination } from './lightningDestination';
import LightningRequestActions from './LightningRequestActions';
import QrCameraScanner from './QrCameraScanner';
import { decodeQrImageFile } from './qrImageImport';
import ZoomableQr from './ZoomableQr';
import './manualExternalLightning.css';

interface Props {
  request: LightningInvoice;
  onUseBolt11(invoice: string): void | Promise<void>;
  onConfirmReceived(): void | Promise<void>;
}

export default function ManualExternalLightningReceiptCard({ request, onUseBolt11, onConfirmReceived }: Props) {
  const { t, formatNumber } = useI18n();
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
  const satsLabel = formatNumber(request.sats);

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
      setLocalError(detail.startsWith(t('receipt.rejected').slice(2).trim()) ? detail : t('receipt.refusedByNoiou', { detail }));
    } finally {
      setBusy(false);
    }
  }

  async function importImage(file: File) {
    try { await applyBolt11(await decodeQrImageFile(file)); }
    catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setLocalError(t('receipt.qrRefused', { detail }));
    }
  }

  async function pasteInvoice() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) throw new Error(t('error.clipboardEmpty'));
      setBolt11(text.trim());
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : t('error.clipboardUnreadable'));
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
          <strong>{t('receipt.satsToCollect', { sats: satsLabel })}</strong>
          <small>{t('receipt.verifyNote')}</small>
        </div>
        <span className={`manual-badge ${exactInvoiceReady ? 'verified' : ''}`}>{exactInvoiceReady ? t('receipt.badge.exact') : t('receipt.badge.prepare')}</span>
      </div>

      {request.preparationError && !exactInvoiceReady && <div className="manual-preparation-warning" role="status">
        <strong>{t('receipt.autoImpossible')}</strong>
        <span>{request.preparationError}</span>
        <small>{t('receipt.autoImpossibleNote')}</small>
      </div>}

      {exactInvoiceReady ? <>
        <div className="official-payment">
          <div className="official-payment-title">
            <span>{t('receipt.officialQr')}</span>
            <strong>{t('invoice.sats', { sats: satsLabel })}</strong>
          </div>
          {request.traceLabel && <small className="payment-trace">{request.traceLabel}</small>}
          <div className="invoice-qr" aria-label={t('receipt.qrAria')}>
            <ZoomableQr value={request.request} label={t('invoice.paymentLabel', { sats: satsLabel })} />
          </div>
          <LightningRequestActions
            request={request.request}
            label={t('invoice.paymentLabel', { sats: satsLabel })}
            disabled={busy}
          />
          <p>{t('receipt.howToPay')}</p>
        </div>

        <div className="receipt-confirmation-step">
          <strong>{t('receipt.afterPayment')}</strong>
          <p className="muted">{t('receipt.noWalletAccess')}</p>
          <label className="manual-confirm-check">
            <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
            {t('receipt.acknowledge', { sats: satsLabel })}
          </label>
          <button type="button" className="primary" disabled={!acknowledged || busy} onClick={() => void confirm()}>
            {t('receipt.confirm', { sats: satsLabel })}
          </button>
        </div>
      </> : <div className="manual-bolt11-entry">
        <strong>{t('receipt.prepareExact')}</strong>
        <small>{t('receipt.generateInvoice', { sats: satsLabel })}</small>
        {request.request && parsed.kind !== 'BOLT11_INVOICE' && <div className="manual-preparation-warning">
          <strong>{t('receipt.linkedDestination', { label: parsed.label })}</strong>
          <span>{t('receipt.destinationNotEnough')}</span>
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
          <button type="button" disabled={!cameraAvailable || busy} onClick={() => setScanning(true)}>{t('destField.scan')}</button>
          <button type="button" disabled={busy} onClick={() => imageInputRef.current?.click()}>{t('manualPayout.photosButton')}</button>
          <button type="button" disabled={!clipboardAvailable || busy} onClick={() => void pasteInvoice()}>{t('destField.paste')}</button>
          <button type="button" className="primary" disabled={!bolt11.trim() || busy} onClick={() => void applyBolt11(bolt11)}>{t('receipt.verifyAndShow')}</button>
          <input ref={imageInputRef} hidden type="file" accept="image/*" onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = '';
            if (file) void importImage(file);
          }} />
        </div>
        {!cameraAvailable && <small>{t('receipt.noCamera')}</small>}
      </div>}

      {localError && <div className="invoice-rejected" role="alert">
        <strong>{t('receipt.rejected')}</strong>
        <span>{localError}</span>
        <small>{t('receipt.rejectedNote')}</small>
      </div>}

      {scanning && <QrCameraScanner
        onDetected={(raw) => void applyBolt11(raw)}
        onCancel={() => setScanning(false)}
      />}
    </div>
  );
}
