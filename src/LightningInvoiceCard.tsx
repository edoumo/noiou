import { QRCodeSVG } from 'qrcode.react';
import type { LightningInvoice } from './lightning';
import LightningRequestActions from './LightningRequestActions';

interface Props {
  invoice: LightningInvoice;
  onSimulatePaid?: () => void;
}

export default function LightningInvoiceCard({ invoice, onSimulatePaid }: Props) {
  const realNwc = invoice.source === 'NWC';

  return (
    <div className="invoice-card">
      <div className="invoice-qr" aria-label="QR code Lightning">
        <QRCodeSVG value={invoice.request} size={180} level="M" marginSize={2} />
      </div>
      <div className="invoice-copy">
        <strong>{invoice.sats.toLocaleString('fr-FR')} sats</strong>
        <small>{invoice.status === 'PAID' ? 'Paiement reçu ✓' : realNwc ? 'Invoice réelle · scanne le QR ou ouvre-la dans un wallet sur ce téléphone' : 'Invoice mock · QR de test uniquement'}</small>
        <code>{invoice.request}</code>
        {realNwc && invoice.status === 'PENDING' && <LightningRequestActions request={invoice.request} label={`Paiement NOIOU · ${invoice.sats.toLocaleString('fr-FR')} sats`} />}
        {onSimulatePaid && invoice.status === 'PENDING' && <button onClick={onSimulatePaid}>{realNwc ? 'Vérifier le paiement' : 'Simuler paiement Lightning'}</button>}
      </div>
    </div>
  );
}
