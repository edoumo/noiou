import { useEffect } from 'react';
import App from './App';
import { installFloatingControlsDodge } from './floatingControlsDodge';
import CashBuyInConfirmationBoundary from './CashBuyInConfirmationBoundary';
import GuidedLobbyControl from './GuidedLobbyControl';
import { I18nProvider } from './i18n/provider';
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
  // Bottom-left floating shortcuts step aside while they would cover a primary
  // in-flow action (e.g. « Continuer vers les joueurs » mid-scroll).
  useEffect(() => installFloatingControlsDodge({ doc: document, win: window }), []);

  return (
    <I18nProvider>
      <NwcSessionProvider>
        <InstallAppControl />
        <CashBuyInConfirmationBoundary><App /></CashBuyInConfirmationBoundary>
        <GuidedLobbyControl />
        <PartyJoinControl />
        <SessionResetControl />
        <NwcReceiveDiagnostic />
        <InteractionPreferences />
      </NwcSessionProvider>
    </I18nProvider>
  );
}
