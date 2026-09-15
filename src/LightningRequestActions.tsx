import { useState } from 'react';
import './lightningRequestActions.css';

interface Props {
  request: string;
  label: string;
  disabled?: boolean;
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

export default function LightningRequestActions({ request, label, disabled = false }: Props) {
  const [status, setStatus] = useState('');
  const shareAvailable = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function copy() {
    try {
      await copyWithFallback(request);
      setStatus('Invoice copiée.');
    } catch {
      setStatus('Copie impossible sur ce navigateur.');
    }
  }

  async function share() {
    if (!shareAvailable) return;
    try {
      await navigator.share({ title: `NOIOU · ${label}`, text: `${label}\nlightning:${request}` });
      setStatus('Partage ouvert.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setStatus('Partage indisponible sur ce navigateur.');
    }
  }

  return <>
    <div className={`actions lightning-request-actions${shareAvailable ? ' has-share' : ''}`}>
      <a className="button-link primary" href={`lightning:${request}`} aria-disabled={disabled}>⚡ Ouvrir</a>
      <button type="button" disabled={disabled} onClick={() => void copy()}>📋 Copier</button>
      {shareAvailable && <button type="button" disabled={disabled} onClick={() => void share()}>↗ Partager</button>}
    </div>
    {status && <small className="copy-status">{status}</small>}
  </>;
}
