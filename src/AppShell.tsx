import App from './App';
import NwcReceiveDiagnostic from './NwcReceiveDiagnostic';
import { NwcSessionProvider } from './NwcSessionContext';

export default function AppShell() {
  return (
    <NwcSessionProvider>
      <App />
      <NwcReceiveDiagnostic />
    </NwcSessionProvider>
  );
}
