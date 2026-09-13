import { QRCodeSVG } from 'qrcode.react';
import type { LightningInvoice } from './lightning';

interface Props {
  invoice: LightningInvoice;
  onSimulatePaid?: () => void;
}

export default function LightningInvoiceCard({ invoice, onSimulatePaid }: Props) {
  const isNwc = invoice.source === 'NWC';
  return (
    <div className="invoice-card">
      <div className="invoice-qr" aria-label="QR code Lightning">
        <QRCodeSVG value={invoice.request} size={180} level="M" marginSize={2} />
      </div>
      <div className="invoice-copy">
        <strong>{invoice.sats.toLocaleString('fr-FR')} sats</strong>
        <small>{invoice.status === 'PAID' ? 'Paiement reçu ✓' : isNwc ? 'Invoice NWC réelle · scanne avec un autre wallet' : 'Scanne ce QR avec le wallet Lightning'}</small>
        <code>{invoice.request}</code>
        {onSimulatePaid && invoice.status === 'PENDING' && <button onClick={onSimulatePaid}>{isNwc ? 'Vérifier le paiement' : 'Simuler paiement Lightning'}</button>}
      </div>
    </div>
  );
}
