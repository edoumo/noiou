import { useState } from 'react';
import { t as translate } from './i18n';
import { useI18n } from './i18n/provider';
import './lightningRequestActions.css';

interface Props {
  request: string;
  label: string;
  disabled?: boolean;
}

function copyWithFallback(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  if (typeof document === 'undefined') return Promise.reject(new Error(translate('requestActions.copyFailed')));
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  return copied ? Promise.resolve() : Promise.reject(new Error(translate('requestActions.copyFailed')));
}

export default function LightningRequestActions({ request, label, disabled = false }: Props) {
  const { t } = useI18n();
  const [status, setStatus] = useState('');
  const shareAvailable = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function copy() {
    try {
      await copyWithFallback(request);
      setStatus(t('requestActions.copied'));
    } catch {
      setStatus(t('requestActions.copyFailed'));
    }
  }

  async function share() {
    if (!shareAvailable) return;
    try {
      await navigator.share({ title: `NOIOU · ${label}`, text: `${label}\nlightning:${request}` });
      setStatus(t('requestActions.shareOpened'));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setStatus(t('requestActions.shareUnavailable'));
    }
  }

  return <>
    <div className={`actions lightning-request-actions${shareAvailable ? ' has-share' : ''}`}>
      <a className="button-link primary" href={`lightning:${request}`} aria-disabled={disabled}>{t('requestActions.open')}</a>
      <button type="button" disabled={disabled} onClick={() => void copy()}>{t('requestActions.copy')}</button>
      {shareAvailable && <button type="button" disabled={disabled} onClick={() => void share()}>{t('requestActions.share')}</button>}
    </div>
    {status && <small className="copy-status">{status}</small>}
  </>;
}
