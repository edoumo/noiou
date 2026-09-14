import App from './App';
import CashBuyInConfirmationBoundary from './CashBuyInConfirmationBoundary';
import InteractionPreferences from './InteractionPreferences';
import NwcReceiveDiagnostic from './NwcReceiveDiagnostic';
import { NwcSessionProvider } from './NwcSessionContext';
import SessionResetControl from './SessionResetControl';
import './uxFixes.css';

export default function AppShell() {
  return (
    <NwcSessionProvider>
      <CashBuyInConfirmationBoundary><App /></CashBuyInConfirmationBoundary>
      <SessionResetControl />
      <NwcReceiveDiagnostic />
      <InteractionPreferences />
    </NwcSessionProvider>
  );
}
