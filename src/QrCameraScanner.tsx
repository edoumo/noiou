import { useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader } from '@zxing/browser';

interface Props {
  onDetected(value: string): void;
  onCancel(): void;
}

export default function QrCameraScanner({ onDetected, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const detectedRef = useRef(onDetected);
  const [error, setError] = useState('');

  useEffect(() => { detectedRef.current = onDetected; }, [onDetected]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const reader = new BrowserQRCodeReader();
    let cancelled = false;
    let controls: { stop(): void } | undefined;

    void reader.decodeFromConstraints(
      { audio: false, video: { facingMode: { ideal: 'environment' } } },
      video,
      (result, _scanError, scanControls) => {
        if (!result || cancelled) return;
        const text = result.getText().trim();
        if (!text) return;
        scanControls.stop();
        detectedRef.current(text);
      },
    ).then((activeControls) => {
      controls = activeControls;
      if (cancelled) controls.stop();
    }).catch((caught) => {
      if (cancelled) return;
      setError(caught instanceof Error ? caught.message : 'Impossible d’ouvrir la caméra');
    });

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, []);

  return (
    <div className="qr-scanner" role="dialog" aria-label="Scanner un QR Lightning">
      <div className="qr-scanner-head">
        <strong>Scanner le QR</strong>
        <button type="button" onClick={onCancel}>Fermer</button>
      </div>
      <video ref={videoRef} className="qr-video" muted playsInline />
      <small>Présente le QR Lightning devant la caméra. Rien n’est envoyé à un serveur NOIOU.</small>
      {error && <div className="alert">Caméra indisponible : {error}</div>}
    </div>
  );
}
