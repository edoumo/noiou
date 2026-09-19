import { useEffect, useMemo, useRef, useState } from 'react';
import { t as translate } from './i18n';
import { useI18n } from './i18n/provider';
import type { Currency } from './domain';
import { parseLightningDestination } from './lightningDestination';
import { requestExactInvoiceFromReusableDestination } from './lnurlPay';
import { parseExactBolt11Invoice } from './manualExternalLightning';
import QrCameraScanner from './QrCameraScanner';
import { decodeQrImageFile } from './qrImageImport';
import ZoomableQr from './ZoomableQr';

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
  if (typeof document === 'undefined') return Promise.reject(new Error(translate('manualPayout.copyFailed')));
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  return copied ? Promise.resolve() : Promise.reject(new Error(translate('manualPayout.copyFailed')));
}

function expectedSats(amount: number, currency: Currency, lockedBtcFiatRate?: number): number {
  if (currency === 'SATS') return Math.round(amount);
  if (!lockedBtcFiatRate || lockedBtcFiatRate <= 0) throw new Error(translate('error.rateMissing'));
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
  const { t, formatNumber } = useI18n();
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
  const satsLabel = formatNumber(sats);
  const parsedDestination = useMemo(() => parseLightningDestination(destination ?? ''), [destination]);
  const effectiveInvoice = parsedDestination.kind === 'BOLT11_INVOICE' ? parsedDestination.value : resolvedInvoice;
  const exactReady = Boolean(effectiveInvoice);
  void acknowledged;
  void setAcknowledged;

  async function copy(text: string, message: string) {
    try {
      await copyWithFallback(text);
      setCopyStatus(message);
    } catch {
      setCopyStatus(t('manualPayout.copyFailed'));
    }
  }

  async function shareInvoice() {
    if (!effectiveInvoice || typeof navigator === 'undefined' || !navigator.share) return;
    try {
      await navigator.share({
        title: `NOIOU · ${label}`,
        text: `NOIOU · ${label} · ${satsLabel} sats\nlightning:${effectiveInvoice}`,
      });
      setCopyStatus(t('manualPayout.shareOpened'));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setCopyStatus(t('manualPayout.shareUnavailable'));
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
      setInvoiceError(detail.startsWith(t('error.invoiceRefusedByNoiou').split(':')[0]) ? detail : t('error.invoiceRefusedByNoiou', { detail }));
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
        setInvoiceError(t('manualPayout.autoImpossible', { detail }));
      })
      .finally(() => setPreparing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination, disabled, exactReady, label, parsedDestination.kind, preparing, sats, traceLabel]);

  async function importImage(file: File) {
    try { await useBolt11(await decodeQrImageFile(file)); }
    catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setInvoiceError(t('error.qrRefused', { detail }));
    }
  }

  async function pasteInvoice() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) throw new Error(t('error.clipboardEmpty'));
      setBolt11(text.trim());
    } catch (error) {
      setInvoiceError(error instanceof Error ? error.message : t('error.clipboardUnreadable'));
    }
  }

  const cameraAvailable = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
  const clipboardAvailable = typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.readText);
  const shareAvailable = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <div className="manual-payout">
      <div className="manual-payout-head">
        <div>
          <strong>{t('manualPayout.settle', { label })}</strong>
          <small>{t('manualPayout.controlsNote')}</small>
        </div>
        <span className="state pending">{exactReady ? t('receipt.badge.exact') : t('receipt.badge.prepare')}</span>
      </div>

      <div className="manual-payout-grid">
        <div><small>{t('manualPayout.beneficiary')}</small><strong>{label}</strong></div>
        <div><small>{t('manualPayout.exactAmount')}</small><strong>{t('invoice.sats', { sats: satsLabel })}</strong></div>
      </div>

      {exactReady ? <div className="official-payment payout-official-payment">
        <div className="official-payment-title"><span>{t('receipt.officialQr')}</span><strong>{t('invoice.sats', { sats: satsLabel })}</strong></div>
        {traceLabel && <small className="payment-trace">{traceLabel}</small>}
        <div className="invoice-qr" aria-label={t('manualPayout.qrAria', { label })}>
          <ZoomableQr value={effectiveInvoice} label={t('manualPayout.qrLabel', { label, sats: satsLabel })} />
        </div>
        <div className={`actions official-payment-actions${shareAvailable ? ' has-share' : ''}`}>
          <a className="button-link primary" href={`lightning:${effectiveInvoice}`}>{t('requestActions.open')}</a>
          <button type="button" disabled={disabled} onClick={() => void copy(effectiveInvoice, t('manualPayout.invoiceCopied'))}>{t('requestActions.copy')}</button>
          {shareAvailable && <button type="button" disabled={disabled} onClick={() => void shareInvoice()}>{t('requestActions.share')}</button>}
        </div>
        <small>{t('manualPayout.verifiedNote')}</small>
      </div> : <div className="manual-bolt11-entry">
        {preparing && <div className="manual-preparation-warning" role="status"><strong>{t('manualPayout.preparing')}</strong><span>{t('manualPayout.preparingNote', { sats: satsLabel })}</span></div>}
        {destination && !preparing && <div className="manual-preparation-warning">
          <strong>{t('manualPayout.linkedDestination', { label: parsedDestination.label })}</strong>
          <span>{parsedDestination.kind === 'BOLT12_OFFER'
            ? t('manualPayout.bolt12Note')
            : parsedDestination.kind === 'LIGHTNING_ADDRESS' || parsedDestination.kind === 'LNURL'
              ? t('manualPayout.autoTried')
              : t('manualPayout.bolt11Needed')}</span>
        </div>}
        {!destination && <p className="muted">{t('manualPayout.mustGenerate', { sats: satsLabel })}</p>}
        <strong>{t('manualPayout.fallbackTitle')}</strong>
        <small>{t('manualPayout.fallbackNote')}</small>
        <div className="manual-bolt11-actions">
          <input value={bolt11} onChange={(event) => setBolt11(event.target.value)} placeholder="lnbc…" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          <button type="button" disabled={!cameraAvailable || disabled} onClick={() => setScanOpen(true)}>{t('destField.scan')}</button>
          <button type="button" disabled={disabled} onClick={() => imageInputRef.current?.click()}>{t('manualPayout.photosButton')}</button>
          <button type="button" disabled={!clipboardAvailable || disabled} onClick={() => void pasteInvoice()}>{t('destField.paste')}</button>
          <button type="button" className="primary" disabled={!bolt11.trim() || disabled} onClick={() => void useBolt11(bolt11)}>{t('receipt.verifyAndShow')}</button>
          <input ref={imageInputRef} hidden type="file" accept="image/*" onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = '';
            if (file) void importImage(file);
          }} />
        </div>
      </div>}

      {invoiceError && <div className="invoice-rejected" role="alert"><strong>{t('manualPayout.rejected')}</strong><span>{invoiceError}</span><small>{t('manualPayout.rejectedNote')}</small></div>}
      {copyStatus && <small className="copy-status">{copyStatus}</small>}

      {scanOpen && <QrCameraScanner
        onDetected={(raw) => void useBolt11(raw)}
        onCancel={() => setScanOpen(false)}
      />}
    </div>
  );
}
