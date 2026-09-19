import { useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader } from '@zxing/browser';
import { useI18n } from './i18n/provider';

interface Props {
  onDetected(value: string): void;
  onCancel(): void;
}

export default function QrCameraScanner({ onDetected, onCancel }: Props) {
  const { t } = useI18n();
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
      setError(caught instanceof Error ? caught.message : t('qr.cameraOpenFailed'));
    });

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, []);

  return (
    <div className="qr-scanner" role="dialog" aria-label={t('qr.dialogAria')}>
      <div className="qr-scanner-head">
        <strong>{t('qr.scanTitle')}</strong>
        <button type="button" onClick={onCancel}>{t('qr.close')}</button>
      </div>
      <video ref={videoRef} className="qr-video" muted playsInline />
      <small>{t('qr.instructions')}</small>
      {error && <div className="alert">{t('qr.cameraUnavailable', { detail: error })}</div>}
    </div>
  );
}
