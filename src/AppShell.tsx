import App from './App';
import InteractionPreferences from './InteractionPreferences';
import NwcReceiveDiagnostic from './NwcReceiveDiagnostic';
import { NwcSessionProvider } from './NwcSessionContext';
import SessionResetControl from './SessionResetControl';
import './uxFixes.css';

export default function AppShell() {
  return (
    <NwcSessionProvider>
      <App />
      <SessionResetControl />
      <NwcReceiveDiagnostic />
      <InteractionPreferences />
    </NwcSessionProvider>
  );
}
