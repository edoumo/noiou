import App from './App';
import CashBuyInConfirmationBoundary from './CashBuyInConfirmationBoundary';
import InteractionPreferences from './InteractionPreferences';
import NwcReceiveDiagnostic from './NwcReceiveDiagnostic';
import { NwcSessionProvider } from './NwcSessionContext';
import PartyJoinControl from './PartyJoinControl';
import SessionResetControl from './SessionResetControl';
import './uxFixes.css';
import './ux20.css';
import './ux22.css';
import './ux24.css';

export default function AppShell() {
  return (
    <NwcSessionProvider>
      <CashBuyInConfirmationBoundary><App /></CashBuyInConfirmationBoundary>
      <PartyJoinControl />
      <SessionResetControl />
      <NwcReceiveDiagnostic />
      <InteractionPreferences />
    </NwcSessionProvider>
  );
}
