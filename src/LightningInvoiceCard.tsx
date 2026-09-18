import { QRCodeSVG } from 'qrcode.react';
import { useI18n } from './i18n/provider';
import type { LightningInvoice } from './lightning';
import LightningRequestActions from './LightningRequestActions';

interface Props {
  invoice: LightningInvoice;
  onSimulatePaid?: () => void;
}

export default function LightningInvoiceCard({ invoice, onSimulatePaid }: Props) {
  const { t, formatNumber } = useI18n();
  const realNwc = invoice.source === 'NWC';
  const sats = formatNumber(invoice.sats);

  return (
    <div className="invoice-card">
      <div className="invoice-qr" aria-label={t('invoice.qrAria')}>
        <QRCodeSVG value={invoice.request} size={180} level="M" marginSize={2} />
      </div>
      <div className="invoice-copy">
        <strong>{t('invoice.sats', { sats })}</strong>
        <small>{invoice.status === 'PAID'
          ? t('invoice.paid')
          : realNwc
            ? t('invoice.real')
            : import.meta.env.DEV
              ? t('invoice.mock')
              : t('invoice.inactive')}</small>
        <code>{invoice.request}</code>
        {realNwc && invoice.status === 'PENDING' && <LightningRequestActions request={invoice.request} label={t('invoice.paymentLabel', { sats })} />}
        {/* UX27: the "simulate payment" shortcut exists only in development/test builds.
            The static DEV gate removes the whole branch (and its copy) from production
            bundles — a production build can never fake a Lightning payment. */}
        {import.meta.env.DEV && onSimulatePaid && !realNwc && invoice.status === 'PENDING' && <button onClick={onSimulatePaid}>{t('invoice.simulate')}</button>}
        {!import.meta.env.DEV && onSimulatePaid && realNwc && invoice.status === 'PENDING' && <button onClick={onSimulatePaid}>{t('invoice.checkPayment')}</button>}
      </div>
    </div>
  );
}
