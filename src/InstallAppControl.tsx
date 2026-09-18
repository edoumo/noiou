import { useEffect, useState } from 'react';
import './install-app.css';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

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

  if (installed) return null;
  const ios = isIos();
  if (!promptEvent && !ios) return null;

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

  return (
    <aside className="install-app" aria-live="polite">
      <button className="install-app-button" type="button" onClick={() => void install()}>
        ⬇ <span className="install-app-label-full">Installer l’app</span><span className="install-app-label-short">Installer</span>
      </button>
      {showIosHelp && (
        <div className="install-app-help">
          Sur iPhone/iPad : ouvre le menu <strong>Partager</strong>, puis choisis <strong>Sur l’écran d’accueil</strong>.
        </div>
      )}
    </aside>
  );
}
