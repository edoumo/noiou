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
        <small>{invoice.status === 'PAID'
          ? 'Paiement reçu ✓'
          : realNwc
            ? 'Invoice réelle · scanne le QR ou ouvre-la dans un wallet sur ce téléphone'
            : import.meta.env.DEV
              ? 'Invoice mock · QR de test uniquement'
              : 'Demande inactive · non encaissable'}</small>
        <code>{invoice.request}</code>
        {realNwc && invoice.status === 'PENDING' && <LightningRequestActions request={invoice.request} label={`Paiement NOIOU · ${invoice.sats.toLocaleString('fr-FR')} sats`} />}
        {/* UX27: the "simulate payment" shortcut exists only in development/test builds.
            The static DEV gate removes the whole branch (and its copy) from production
            bundles — a production build can never fake a Lightning payment. */}
        {import.meta.env.DEV && onSimulatePaid && !realNwc && invoice.status === 'PENDING' && <button onClick={onSimulatePaid}>Simuler paiement Lightning</button>}
        {!import.meta.env.DEV && onSimulatePaid && realNwc && invoice.status === 'PENDING' && <button onClick={onSimulatePaid}>Vérifier le paiement</button>}
      </div>
    </div>
  );
}
