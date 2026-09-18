import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useI18n } from './i18n/provider';
import './zoomableQr.css';

interface Props {
  value: string;
  label: string;
  size?: number;
}

export default function ZoomableQr({ value, label, size = 220 }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="zoomable-qr-trigger"
        aria-label={t('qr.zoom.enlargeAria', { label })}
        title={t('qr.zoom.enlarge')}
        onClick={() => setOpen(true)}
      >
        <QRCodeSVG value={value} size={size} level="M" marginSize={2} />
        <small>{t('qr.zoom.button')}</small>
      </button>

      {open && <div className="qr-zoom-backdrop" role="dialog" aria-modal="true" aria-label={t('qr.zoom.expandedAria', { label })} onClick={() => setOpen(false)}>
        <div className="qr-zoom-panel" onClick={(event) => event.stopPropagation()}>
          <div className="qr-zoom-head">
            <strong>{label}</strong>
            <button type="button" onClick={() => setOpen(false)}>{t('qr.close')}</button>
          </div>
          <div className="qr-zoom-code">
            <QRCodeSVG value={value} size={420} level="M" marginSize={3} />
          </div>
          <small>{t('qr.zoom.note')}</small>
        </div>
      </div>}
    </>
  );
}
