import { useEffect, useRef, useState } from 'react';
import { useI18n } from './i18n/provider';
import { DEFAULT_PREFERENCES, isFinancialActionLabel, loadUserPreferences, saveUserPreferences, type UserPreferences } from './preferences';
import { localeDescriptor } from './i18n/locales';
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
  const { locale, publicLocales, t, setLocale } = useI18n();
  const audioContextRef = useRef<AudioContext | null>(null);

  // The selector only offers locales whose catalog is complete, and the
  // preference store is aligned with the active locale so a reload restores it.
  const catalogReady = publicLocales.length > 1 && publicLocales.some((entry) => entry.code === locale);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    saveUserPreferences(window.localStorage, { ...preferences, locale });
  }, [preferences, locale]);

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
      <summary>⚙ {t('prefs.settings')}</summary>
      <div className="global-preferences-panel">
        {catalogReady && <>
          <label>{t('prefs.language')}
            <select
              value={locale}
              onChange={(event) => setLocale(event.target.value)}
            >
              {publicLocales.map((entry) => (
                <option key={entry.code} value={entry.code}>{entry.flag} {localeDescriptor(entry.code)?.name ?? entry.name}</option>
              ))}
            </select>
          </label>
        </>}

        <label className="preference-toggle">
          <input
            type="checkbox"
            checked={preferences.vibrateOnPress}
            onChange={(event) => update({ vibrateOnPress: event.target.checked })}
          />
          <span><strong>{t('prefs.vibration')}</strong><small>{t('prefs.vibrationNote')}</small></span>
        </label>

        <label className="preference-toggle">
          <input
            type="checkbox"
            checked={preferences.clickSound}
            onChange={(event) => update({ clickSound: event.target.checked })}
          />
          <span><strong>{t('prefs.clickSound')}</strong><small>{t('prefs.clickSoundNote')}</small></span>
        </label>

        <label className="preference-toggle">
          <input
            type="checkbox"
            checked={preferences.financialSound}
            onChange={(event) => update({ financialSound: event.target.checked })}
          />
          <span><strong>{t('prefs.financialSound')}</strong><small>{t('prefs.financialSoundNote')}</small></span>
        </label>
      </div>
    </details>
  );
}
