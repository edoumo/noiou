import { useMemo, useState } from 'react';
import { parseLightningDestination } from './lightningDestination';
import QrCameraScanner from './QrCameraScanner';
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
  const parsed = useMemo(() => parseLightningDestination(value), [value]);
  const cameraAvailable = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

  function handleDetected(raw: string) {
    const detected = parseLightningDestination(raw);
    onChange(detected.value || raw.trim());
    setScanning(false);
    setScanMessage(detected.kind === 'UNKNOWN'
      ? 'QR lu, mais le format Lightning n’est pas reconnu.'
      : `${detected.label} détecté.`);
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
          placeholder="alice@wallet.example ou lno1…"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>
      <div className="destination-actions">
        <button type="button" disabled={!cameraAvailable} onClick={() => setScanning(true)}>📷 Scanner un QR</button>
        {value && <span className={`destination-kind ${parsed.reusable ? 'valid' : parsed.kind === 'BOLT11_INVOICE' ? 'warning' : 'unknown'}`}>{parsed.label}</span>}
      </div>
      {parsed.kind === 'BOLT11_INVOICE' && <small className="destination-warning">Cette invoice BOLT11 est ponctuelle et peut expirer. Pour un profil joueur/dealer, préfère une Lightning Address, une offre BOLT12 (Phoenix) ou un LNURL réutilisable.</small>}
      {parsed.kind === 'BOLT12_OFFER' && <small className="destination-ok">Offre BOLT12 réutilisable · adaptée notamment à Phoenix.</small>}
      {compactHint && <small className="destination-hint">{compactHint}</small>}
      {!cameraAvailable && <small className="destination-hint">Caméra non disponible dans ce navigateur : tu peux coller la destination manuellement.</small>}
      {scanMessage && <small className="destination-hint">{scanMessage}</small>}
      {scanning && <QrCameraScanner onDetected={handleDetected} onCancel={() => setScanning(false)} />}
    </div>
  );
}
