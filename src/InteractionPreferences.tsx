import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_PREFERENCES,
  SUPPORTED_LOCALES,
  isFinancialActionLabel,
  loadUserPreferences,
  preferenceText,
  saveUserPreferences,
  type SupportedLocale,
  type UserPreferences,
} from './preferences';
import './preferences.css';

function readPreferences(): UserPreferences {
  if (typeof window === 'undefined') return { ...DEFAULT_PREFERENCES };
  return loadUserPreferences(window.localStorage);
}

function playTone(context: AudioContext, frequency: number, durationMs: number, delaySeconds = 0): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, context.currentTime + delaySeconds);
  gain.gain.exponentialRampToValueAtTime(0.055, context.currentTime + delaySeconds + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + delaySeconds + durationMs / 1000);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(context.currentTime + delaySeconds);
  oscillator.stop(context.currentTime + delaySeconds + durationMs / 1000 + 0.02);
}

export default function InteractionPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>(() => readPreferences());
  const languageCatalogReady = !import.meta.env.PROD;
  const effectiveLocale: SupportedLocale = languageCatalogReady ? preferences.locale : 'fr-FR';
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    saveUserPreferences(window.localStorage, preferences);
    document.documentElement.lang = effectiveLocale;
  }, [preferences, effectiveLocale]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    function handleClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target.closest('button') : null;
      if (!(target instanceof HTMLButtonElement) || target.disabled) return;

      const label = target.innerText || target.getAttribute('aria-label') || '';
      const financial = isFinancialActionLabel(label);

      if (preferences.vibrateOnPress && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(financial ? [18, 22, 42] : 12);
      }

      const shouldPlayFinancial = financial && preferences.financialSound;
      const shouldPlayClick = preferences.clickSound;
      if (!shouldPlayFinancial && !shouldPlayClick) return;

      const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return;

      const context = audioContextRef.current ?? new AudioContextCtor();
      audioContextRef.current = context;
      if (context.state === 'suspended') void context.resume();

      if (shouldPlayFinancial) {
        playTone(context, 620, 95);
        playTone(context, 880, 130, 0.085);
      } else if (shouldPlayClick) {
        playTone(context, 720, 55);
      }
    }

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [preferences]);

  useEffect(() => () => {
    if (audioContextRef.current) void audioContextRef.current.close();
  }, []);

  function update(next: Partial<UserPreferences>) {
    setPreferences((current) => ({ ...current, ...next }));
  }

  return (
    <details className="global-preferences">
      <summary>⚙ {preferenceText(effectiveLocale, 'settings')}</summary>
      <div className="global-preferences-panel">
        {languageCatalogReady && <>
          <label>{preferenceText(effectiveLocale, 'language')}
            <select
              value={preferences.locale}
              onChange={(event) => update({ locale: event.target.value as SupportedLocale })}
            >
              {SUPPORTED_LOCALES.map((locale) => (
                <option key={locale.code} value={locale.code}>{locale.flag} {locale.name}</option>
              ))}
            </select>
          </label>
          <small>{preferenceText(effectiveLocale, 'languageNote')}</small>
        </>}

        <label className="preference-toggle">
          <input
            type="checkbox"
            checked={preferences.vibrateOnPress}
            onChange={(event) => update({ vibrateOnPress: event.target.checked })}
          />
          <span><strong>{preferenceText(effectiveLocale, 'vibration')}</strong><small>{preferenceText(effectiveLocale, 'vibrationNote')}</small></span>
        </label>

        <label className="preference-toggle">
          <input
            type="checkbox"
            checked={preferences.clickSound}
            onChange={(event) => update({ clickSound: event.target.checked })}
          />
          <span><strong>{preferenceText(effectiveLocale, 'clickSound')}</strong><small>{preferenceText(effectiveLocale, 'clickSoundNote')}</small></span>
        </label>

        <label className="preference-toggle">
          <input
            type="checkbox"
            checked={preferences.financialSound}
            onChange={(event) => update({ financialSound: event.target.checked })}
          />
          <span><strong>{preferenceText(effectiveLocale, 'financialSound')}</strong><small>{preferenceText(effectiveLocale, 'financialSoundNote')}</small></span>
        </label>
      </div>
    </details>
  );
}
