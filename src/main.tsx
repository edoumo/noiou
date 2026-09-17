import React from 'react';
import ReactDOM from 'react-dom/client';
import AppShell from './AppShell';
import { applyPendingJoinLandingScrollGuard } from './joinLanding';

// UX26-F1: while a QR join reload is in flight the browser scroll restoration is not
// deterministic; suppress it for this boot so the one-shot landing scroll is the only
// scroll applied after the reload. No-op when no landing target is pending.
applyPendingJoinLandingScrollGuard({
  storage: window.sessionStorage,
  setMode: (mode) => { window.history.scrollRestoration = mode; },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppShell />
  </React.StrictMode>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}
