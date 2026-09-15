import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import './zoomableQr.css';

interface Props {
  value: string;
  label: string;
  size?: number;
}

export default function ZoomableQr({ value, label, size = 220 }: Props) {
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
        aria-label={`${label}. Appuyer pour agrandir le QR`}
        title="Appuyer pour agrandir"
        onClick={() => setOpen(true)}
      >
        <QRCodeSVG value={value} size={size} level="M" marginSize={2} />
        <small>🔍 Agrandir</small>
      </button>

      {open && <div className="qr-zoom-backdrop" role="dialog" aria-modal="true" aria-label={`${label} agrandi`} onClick={() => setOpen(false)}>
        <div className="qr-zoom-panel" onClick={(event) => event.stopPropagation()}>
          <div className="qr-zoom-head">
            <strong>{label}</strong>
            <button type="button" onClick={() => setOpen(false)}>Fermer</button>
          </div>
          <div className="qr-zoom-code">
            <QRCodeSVG value={value} size={420} level="M" marginSize={3} />
          </div>
          <small>QR agrandi automatiquement. Aucun zoom manuel du navigateur n’est nécessaire.</small>
        </div>
      </div>}
    </>
  );
}
