import App from './App';
import InteractionPreferences from './InteractionPreferences';
import NwcReceiveDiagnostic from './NwcReceiveDiagnostic';
import { NwcSessionProvider } from './NwcSessionContext';

export default function AppShell() {
  return (
    <NwcSessionProvider>
      <App />
      <NwcReceiveDiagnostic />
      <InteractionPreferences />
    </NwcSessionProvider>
  );
}
