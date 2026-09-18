import App from './App';
import CashBuyInConfirmationBoundary from './CashBuyInConfirmationBoundary';
import GuidedLobbyControl from './GuidedLobbyControl';
import InteractionPreferences from './InteractionPreferences';
import InstallAppControl from './InstallAppControl';
import NwcReceiveDiagnostic from './NwcReceiveDiagnostic';
import { NwcSessionProvider } from './NwcSessionContext';
import PartyJoinControl from './PartyJoinControl';
import SessionResetControl from './SessionResetControl';
import './uxFixes.css';
import './ux20.css';
import './ux22.css';
import './ux24.css';
import './ux25.css';
import './ux27.css';

export default function AppShell() {
  return (
    <NwcSessionProvider>
      <CashBuyInConfirmationBoundary><App /></CashBuyInConfirmationBoundary>
      <GuidedLobbyControl />
      <PartyJoinControl />
      <SessionResetControl />
      <NwcReceiveDiagnostic />
      <InteractionPreferences />
      <InstallAppControl />
    </NwcSessionProvider>
  );
}
