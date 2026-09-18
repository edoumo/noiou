import { useEffect, useState } from 'react';
import './install-app.css';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_KEY = 'noiou.install-banner-dismissed.v1';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  return window.matchMedia('(display-mode: standalone)').matches || iosStandalone;
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export default function InstallAppControl() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
      setShowIosHelp(false);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || dismissed) return null;
  const ios = isIos();
  if (!promptEvent && !ios) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* private mode: dismissal stays session-only */
    }
  }

  async function install() {
    if (promptEvent) {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        setInstalled(true);
        setPromptEvent(null);
      }
      return;
    }
    if (ios) setShowIosHelp((current) => !current);
  }

  // In-flow banner (no fixed positioning): it scrolls away with the page, so
  // it can never cover the settings pill, the QR launcher, buy-in/rebuy
  // buttons, invoices or settlement controls. Dismissible, and hidden once
  // the app runs installed/standalone.
  return (
    <section className="install-app" aria-live="polite">
      <div className="install-app-inner">
        <div className="install-app-copy">
          <strong>Installer NOIOU</strong>
          <small>Ajoute l’application à l’écran d’accueil et ouvre-la en plein écran.</small>
        </div>
        <div className="install-app-actions">
          <button className="install-app-button" type="button" onClick={() => void install()}>
            ⬇ Installer l’app
          </button>
          <button
            className="install-app-dismiss"
            type="button"
            aria-label="Ne plus proposer l’installation"
            onClick={dismiss}
          >
            ✕
          </button>
        </div>
      </div>
      {showIosHelp && (
        <div className="install-app-help">
          Sur iPhone/iPad : ouvre le menu <strong>Partager</strong>, puis choisis <strong>Sur l’écran d’accueil</strong>.
        </div>
      )}
    </section>
  );
}
