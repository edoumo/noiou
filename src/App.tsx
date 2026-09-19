import { useEffect, useRef, useState } from 'react';
import { t as translate, type LocaleCode } from './i18n';
import { useI18n } from './i18n/provider';
import { backupFilename, createSessionBackup, parseSessionBackup } from './backup';
import ConfirmDialog from './ConfirmDialog';
import { createDealerTip } from './dealerTips';
import type {
  Contribution,
  ContributionKind,
  Currency,
  DealerMode,
  DealerTip,
  FinalStack,
  Game,
  LedgerEvent,
  LedgerEventType,
  LightningReceiveMode,
  PaymentMethod,
  Payout,
  Player,
  ProjectDonation,
  SettlementResult,
} from './domain';
import { buildPaymentTrace, buildTraceLabel, prepareExternalIncomingRequest } from './externalWalletFlow';
import {
  checkGameClosure,
  confirmCashContribution,
  confirmLightningContribution,
  confirmPayout,
  createContribution,
  markContributionPending,
} from './game';
import { appendLedgerEvent, verifyLedger } from './ledger';
import LightningDestinationField from './LightningDestinationField';
import { normalizeReusableLightningDestination, parseLightningDestination } from './lightningDestination';
import LightningInvoiceCard from './LightningInvoiceCard';
import ManualExternalLightningReceiptCard from './ManualExternalLightningReceiptCard';
import ManualLightningPayoutCard from './ManualLightningPayoutCard';
import { MockLightningAdapter, type LightningInvoice } from './lightning';
import { isPlayStarted, lobbyReadiness, MIN_POKER_PLAYERS } from './lobby';
import { parseExactBolt11Invoice } from './manualExternalLightning';
import { MAX_LIVE_GAME_INVOICE_SATS, useNwcSession } from './NwcSessionContext';
import { allocateOrganizerWalletContribution, retainOrganizerPayout as retainOrganizerPayoutAccounting } from './organizerAccounting';
import { initialBuyInMethods, paymentChoiceLabel, rebuyActionClass } from './paymentFlow';
import {
  amountStepFor,
  defaultCurrencyForLocale,
  loadCreationCurrencyPreference,
  resolveCreationCurrency,
  saveCreationCurrencyPreference,
  SUPPORTED_CURRENCIES,
  type CreationCurrencyPreference,
} from './currency';
import { DEFAULT_PREFERENCES, loadUserPreferences, PREFERENCES_SAVED_EVENT, saveUserPreferences, type UserPreferences } from './preferences';
import {
  effectiveLockedRate,
  isManualLockedRate,
  normalizeImportedGame,
  planRateLock,
  priceRateLockedPayload,
  type RatePlan,
} from './ratePlan';
import {
  fetchQuote,
  PriceOracleError,
  providerLabelKey,
  providerSupportsCurrency,
  automaticProvidersForCurrency,
  PRICE_PROVIDER_IDS,
  type RateProviderId,
  type RateQuote,
} from './priceOracle';
import { planMockRetirement, type MockRetirementPlan } from './receiveModeMigration';
import { RateSourceControl, LockedRateSummary } from './RateSourceControl';
import {
  assertReceiveModeAllowed,
  availableReceiveModes,
  defaultReceiveMode,
  nwcRuntimeStateLabel,
  receiveModeLabel,
  RUNTIME,
} from './runtimeMode';
import {
  clearSession,
  loadSession,
  saveSession,
  sessionRequiresNwcReceipts,
  SESSION_SCHEMA_VERSION,
  type SessionSnapshot,
} from './session';
import { calculateIssuedChips, calculateSettlement } from './settlement';
import {
  applyResolvedTheme,
  loadThemePreference,
  resolveTheme,
  saveThemePreference,
  type ThemePreference,
} from './theme';
import WorkflowGuide from './WorkflowGuide';
import './styles.css';
import './ux19.css';
import './ux23.css';

function formatAmount(amount: number, currency: Currency, locale: LocaleCode = 'fr-FR'): string {
  if (currency === 'SATS') return `${Math.round(amount).toLocaleString(locale)} sats`;
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
}

function toSats(amount: number, game: Game): number {
  if (game.currency === 'SATS') return Math.round(amount);
  // A cash-only game declared at creation never converted anything: say so
  // plainly instead of reporting a technically missing rate.
  if (game.cashOnly) throw new Error(translate('error.cashOnlyNoLightning'));
  if (!game.lockedBtcFiatRate || game.lockedBtcFiatRate <= 0) throw new Error(translate('error.rateMissing'));
  return Math.round((amount / game.lockedBtcFiatRate) * 100_000_000);
}

function configuredChipsPerBuyIn(game: Game | null | undefined): number {
  if (game?.chipsPerBuyIn !== undefined && Number.isInteger(game.chipsPerBuyIn) && game.chipsPerBuyIn > 0) return game.chipsPerBuyIn;
  if (game && Number.isFinite(game.chipValue) && game.chipValue > 0) {
    const legacy = game.buyInAmount / game.chipValue;
    if (Number.isInteger(legacy) && legacy > 0) return legacy;
  }
  return 10;
}

function readStoredSession(): SessionSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    return loadSession(window.localStorage);
  } catch {
    return null;
  }
}

function readThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'AUTO';
  return loadThemePreference(window.localStorage);
}

function readStoredPreferences(): UserPreferences {
  if (typeof window === 'undefined') return { ...DEFAULT_PREFERENCES };
  return loadUserPreferences(window.localStorage);
}

function normalizeDealerMode(mode: DealerMode | undefined): 'NONE' | 'FIXED' | 'PERCENT' {
  if (mode === 'FIXED' || mode === 'PERCENT' || mode === 'NONE') return mode;
  return 'NONE';
}

function mockInvoicesOnly(invoices: Record<string, LightningInvoice>): LightningInvoice[] {
  return Object.values(invoices).filter((invoice) => !invoice.source || invoice.source === 'MOCK');
}

function workflowStep(game: Game | null): number {
  if (!game) return 1;
  if (game.status === 'OPEN') return 2;
  if (game.status === 'SETTLING') return 3;
  return 4;
}

interface BootSession {
  session: SessionSnapshot | null;
  migrationNotice: string;
  migration: MockRetirementPlan | null;
}

/**
 * UX27 — the "Mock / test" receive mode is retired from the production experience.
 * An active local session whose receive mode resolved to mock (or to nothing, the old
 * default) must never keep creating fictional invoices or count fictional receipts as
 * real money: at boot we migrate it to the explicit external/manual flow, cancel every
 * fictional cave/recave (rebuy) and let the organizer re-collect them through a real flow.
 * Development/test builds keep the mock available and skip the migration entirely.
 */
function readBootSession(): BootSession {
  const stored = readStoredSession();
  if (!stored) return { session: null, migrationNotice: '', migration: null };
  const plan = planMockRetirement(stored, {
    allowMockPayments: RUNTIME.allowMockPayments,
    nwcLocked: sessionRequiresNwcReceipts(stored),
  });
  if (!plan.migrated || !plan.game) return { session: stored, migrationNotice: '', migration: null };
  const cancelledCount = plan.cancelledOpenContributionIds.length + plan.cancelledPaidContributionIds.length;
  const details = plan.historicalMockReceiptsRemain
    ? translate('migration.historyRemains')
    : cancelledCount > 0
      ? translate('migration.cancelled', { count: cancelledCount })
      : translate('migration.none');
  return {
    session: { ...stored, game: plan.game, contributions: plan.contributions },
    migrationNotice: translate('migration.notice', { details }),
    migration: plan,
  };
}


/** Map a game/contribution status enum to its localized label. */
function statusLabel(status: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  const map: Record<string, string> = {
    OPEN: 'game.status.open',
    SETTLING: 'game.status.settling',
    CLOSED: 'game.status.closed',
    DRAFT: 'game.status.draft',
    CANCELLED: 'game.status.cancelled',
    CREATED: 'status.created',
    PENDING: 'status.pending',
    PAID: 'status.paid',
    CONFIRMED: 'status.paid',
  };
  const key = map[status];
  return key ? t(key) : status;
}

function scrollToTarget(id: string) {
  if (typeof document === 'undefined') return;
  window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}

function hasPaidBuyInIn(contributions: readonly Contribution[], playerId: string): boolean {
  return contributions.some((contribution) => contribution.playerId === playerId && contribution.kind === 'BUYIN' && contribution.status === 'PAID');
}

export default function App() {
  const { t, locale, formatAmount: fmt } = useI18n();
  const nwc = useNwcSession();
  const [boot] = useState<BootSession>(() => readBootSession());
  const initialSession = boot.session;
  const [migrationNotice, setMigrationNotice] = useState(boot.migrationNotice);
  const adapterRef = useRef<MockLightningAdapter | null>(null);
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  if (!adapterRef.current) adapterRef.current = new MockLightningAdapter(mockInvoicesOnly(initialSession?.mockInvoices ?? {}));
  const ledgerRef = useRef<LedgerEvent[]>(initialSession?.ledger ?? []);

  const [themePreference, setThemePreference] = useState<ThemePreference>(() => readThemePreference());
  /**
   * Creation-time currency. It follows the ACTIVE LOCALE's default (exact
   * region — never a naive "Europe ⇒ EUR" rule) until the organizer picks one
   * explicitly; an explicit choice survives language changes and can be reset
   * to the locale default. A created game keeps `game.currency` for good: this
   * state only shapes the NEXT creation form (see `src/currency.ts`).
   */
  const [currencyPreference, setCurrencyPreference] = useState<CreationCurrencyPreference>(() => {
    const stored = typeof window === 'undefined' ? null : loadCreationCurrencyPreference(window.localStorage);
    return resolveCreationCurrency(stored, locale);
  });
  /** Currency being configured right now (the form writes it; a created game keeps its own). */
  const currency = currencyPreference.currency;
  /**
   * Cash-only declaration for the next game. When checked, NO BTC/fiat rate is
   * required or locked and no market call is ever attempted, which is what
   * lets any supported local currency run a fully offline cash game.
   */
  const [cashOnly, setCashOnly] = useState(false);
  const [buyIn, setBuyIn] = useState(initialSession?.game?.buyInAmount ?? 10);
  const [chipsPerBuyIn, setChipsPerBuyIn] = useState(() => configuredChipsPerBuyIn(initialSession?.game));
  /**
   * Rate source for the NEXT game. It is only a preference: the rate actually
   * used by a game is locked in `game.lockedRate` at creation and can never be
   * changed afterwards (see `ratePlan.ts`).
   */
  const [rateProvider, setRateProvider] = useState<RateProviderId>(() => readStoredPreferences().rateProvider);
  const [rateQuote, setRateQuote] = useState<RateQuote | null>(null);
  const [rateQuoteError, setRateQuoteError] = useState<PriceOracleError | null>(null);
  const [rateFetching, setRateFetching] = useState(false);
  const [manualRate, setManualRate] = useState<number | null>(initialSession?.game?.lockedRate?.manual || initialSession?.game?.currency === 'SATS' ? null : null);
  const [manualRateNote, setManualRateNote] = useState('');
  const [manualRateConfirmed, setManualRateConfirmed] = useState(false);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  const [lightningReceiveMode, setLightningReceiveMode] = useState<LightningReceiveMode>(() => initialSession?.game?.lightningReceiveMode ?? defaultReceiveMode(nwc.connected));
  const [organizerLightningDestination, setOrganizerLightningDestination] = useState(initialSession?.game?.organizerLightningDestination ?? '');
  const [dealerEnabled, setDealerEnabled] = useState(initialSession?.game?.dealer.enabled ?? false);
  const [dealerMode, setDealerMode] = useState<'NONE' | 'FIXED' | 'PERCENT'>(() => normalizeDealerMode(initialSession?.game?.dealer.mode));
  const [dealerValue, setDealerValue] = useState(initialSession?.game?.dealer.value ?? 10);
  const [dealerLabel, setDealerLabel] = useState(initialSession?.game?.dealer.label ?? 'Dealer');
  const [dealerPayment, setDealerPayment] = useState<PaymentMethod>(initialSession?.game?.dealer.preferredPayment === 'LIGHTNING' ? 'LIGHTNING' : 'CASH');
  const [dealerLightningAddress, setDealerLightningAddress] = useState(initialSession?.game?.dealer.lightningAddress ?? '');
  const [startupDonationSats, setStartupDonationSats] = useState(0);

  const [game, setGame] = useState<Game | null>(initialSession?.game ?? null);
  const [players, setPlayers] = useState<Player[]>(initialSession?.players ?? []);
  const [nickname, setNickname] = useState('');
  const [preferredPayment, setPreferredPayment] = useState<PaymentMethod | 'ANY'>('CASH');
  const [lightningAddress, setLightningAddress] = useState('');
  const [isOrganizerPlayer, setIsOrganizerPlayer] = useState(false);
  const [contributions, setContributions] = useState<Contribution[]>(initialSession?.contributions ?? []);
  const [invoices, setInvoices] = useState<Record<string, LightningInvoice>>(initialSession?.mockInvoices ?? {});
  const [stacks, setStacks] = useState<Record<string, number>>(initialSession?.stacks ?? {});
  const [stacksLocked, setStacksLocked] = useState(initialSession?.stacksLocked ?? false);
  const [settlement, setSettlement] = useState<SettlementResult | null>(initialSession?.settlement ?? null);
  const [payouts, setPayouts] = useState<Payout[]>(initialSession?.payouts ?? []);
  const [dealerPaid, setDealerPaid] = useState(initialSession?.dealerPaid ?? false);
  const [dealerTips, setDealerTips] = useState<DealerTip[]>(initialSession?.dealerTips ?? []);
  const [dealerTipAmounts, setDealerTipAmounts] = useState<Record<string, number>>({});
  const [dealerTipMethods, setDealerTipMethods] = useState<Record<string, PaymentMethod>>({});
  const [cashRebuyConfirmation, setCashRebuyConfirmation] = useState<Player | null>(null);
  const [organizerAllocationConfirmation, setOrganizerAllocationConfirmation] = useState<{ player: Player; kind: ContributionKind } | null>(null);
  const [projectDonations, setProjectDonations] = useState<ProjectDonation[]>(initialSession?.projectDonations ?? []);
  const [donationSats, setDonationSats] = useState(1000);
  const [donorLabel, setDonorLabel] = useState('');
  const [ledger, setLedger] = useState<LedgerEvent[]>(initialSession?.ledger ?? []);
  const [ledgerVerified, setLedgerVerified] = useState(initialSession ? false : true);
  const [lastSavedAt, setLastSavedAt] = useState(initialSession?.savedAt ?? '');
  const [sessionRestored, setSessionRestored] = useState(Boolean(initialSession?.game));
  const [backupStatus, setBackupStatus] = useState('');
  const [error, setError] = useState('');
  /** UX27: tracks a deliberate organizer choice so the safe default never overrides it. */
  const receiveModeTouched = useRef(false);

  /**
   * Explicit, safe default (no silent fallback): before a game exists, arming a real NWC
   * wallet selects the NWC automatic mode; otherwise the external/manual wallet flow stays
   * selected. A manual choice is always respected.
   */
  useEffect(() => {
    if (game || receiveModeTouched.current) return;
    if (nwc.connected) setLightningReceiveMode('NWC_RECEIVE_ONLY');
  }, [game, nwc.connected]);

  function snapshot(savedAt = new Date().toISOString()): SessionSnapshot {
    return {
      schemaVersion: SESSION_SCHEMA_VERSION,
      savedAt,
      game,
      players,
      contributions,
      mockInvoices: invoices,
      stacks,
      stacksLocked,
      settlement,
      payouts,
      dealerPaid,
      ledger,
      projectDonations,
      dealerTips,
    };
  }

  function applySnapshot(restored: SessionSnapshot) {
    ledgerRef.current = restored.ledger;
    adapterRef.current = new MockLightningAdapter(mockInvoicesOnly(restored.mockInvoices));
    setGame(restored.game);
    setPlayers(restored.players);
    setContributions(restored.contributions);
    setInvoices(restored.mockInvoices);
    setStacks(restored.stacks);
    setStacksLocked(restored.stacksLocked);
    setSettlement(restored.settlement);
    setPayouts(restored.payouts);
    setDealerPaid(restored.dealerPaid);
    setDealerTips(restored.dealerTips ?? []);
    setLedger(restored.ledger);
    setProjectDonations(restored.projectDonations);
    setLastSavedAt(restored.savedAt);
    setSessionRestored(Boolean(restored.game));

    if (restored.game) {
      // Import restores the EXACT historical currency: it is never recomputed
      // from the current locale (mandate §23).
      setCurrencyPreference({ auto: false, currency: restored.game.currency });
      setBuyIn(restored.game.buyInAmount);
      setChipsPerBuyIn(configuredChipsPerBuyIn(restored.game));
      // Import never refetches a rate: the imported game keeps the exact
      // historical rate (lockedRate, or the documented legacy manual value).
      setLightningReceiveMode(restored.game.lightningReceiveMode ?? defaultReceiveMode(nwc.connected));
      setOrganizerLightningDestination(restored.game.organizerLightningDestination ?? '');
      setDealerEnabled(restored.game.dealer.enabled);
      setDealerMode(normalizeDealerMode(restored.game.dealer.mode));
      setDealerValue(restored.game.dealer.value ?? 10);
      setDealerLabel(restored.game.dealer.label ?? 'Dealer');
      setDealerPayment(restored.game.dealer.preferredPayment === 'LIGHTNING' ? 'LIGHTNING' : 'CASH');
      setDealerLightningAddress(restored.game.dealer.lightningAddress ?? '');
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => applyResolvedTheme(resolveTheme(themePreference, media.matches));
    saveThemePreference(window.localStorage, themePreference);
    apply();
    if (themePreference !== 'AUTO') return;
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [themePreference]);

  useEffect(() => {
    let active = true;
    void verifyLedger(ledger).then((valid) => {
      if (active) setLedgerVerified(valid);
    });
    return () => { active = false; };
  }, [ledger]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedAt = new Date().toISOString();
    saveSession(window.localStorage, snapshot(savedAt));
    setLastSavedAt(savedAt);
  }, [game, players, contributions, invoices, stacks, stacksLocked, settlement, payouts, dealerPaid, dealerTips, ledger, projectDonations]);

  /**
   * Browser connectivity hint. `navigator.onLine === false` is only an UX
   * accelerant (immediate, clear help instead of a network timeout); it is
   * NEVER treated as proof of (dis)connectivity — the fetch itself remains the
   * authority for every automatic rate source.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => setOnline(navigator.onLine !== false);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  /**
   * Keep the preferred rate source in sync with the settings panel. The
   * preference applies to the NEXT game only: an active game keeps the rate it
   * locked at creation (see `lockedRate`), so no re-render here can alter it.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => setRateProvider(readStoredPreferences().rateProvider);
    window.addEventListener(PREFERENCES_SAVED_EVENT, sync);
    return () => window.removeEventListener(PREFERENCES_SAVED_EVENT, sync);
  }, []);

  /**
   * Locale ⇒ default currency, for the NEXT creation only.
   *
   * While the organizer has never picked a currency by hand (`auto`), changing
   * the language adjusts the suggested currency (fr-FR ⇒ EUR, then en-US ⇒
   * USD). An EXPLICIT pick is never replaced silently: switching to Japanese
   * keeps the chosen GBP. A game already created keeps `game.currency` for
   * good — this effect touches the creation form only.
   */
  useEffect(() => {
    if (game) return;
    setCurrencyPreference((current) => {
      if (!current.auto) return current;
      const next = defaultCurrencyForLocale(locale) ?? 'EUR';
      return next === current.currency ? current : { auto: true, currency: next };
    });
  }, [locale, game]);

  /**
   * Keep the automatic source usable for the configured currency (§13/§14).
   *
   * Kraken publishes no BTC/DKK, BTC/HUF or BTC/KRW: with those currencies the
   * selection moves to the first provider that really does publish the pair
   * (Coinbase today). An explicit MANUAL selection is never touched, and when
   * NO automatic source exists the selection is left alone so the form can say
   * so plainly instead of pretending.
   */
  useEffect(() => {
    if (currency === 'SATS') return;
    if (providerSupportsCurrency(rateProvider, currency)) return;
    const automatic = automaticProvidersForCurrency(currency)[0];
    if (automatic) setRateProvider(automatic);
  }, [currency, rateProvider]);

  /**
   * UX27: record the one-time mock-retirement migration in the tamper-evident ledger so the
   * audit trail explains why fictional receipts were cancelled. Runs once per app boot.
   */
  const bootMigrationRecorded = useRef(false);
  useEffect(() => {
    if (bootMigrationRecorded.current) return;
    bootMigrationRecorded.current = true;
    const migration = boot.migration;
    if (!migration?.game) return;
    void record(migration.game.id, 'RECEIVE_MODE_MIGRATED', {
      from: 'MOCK',
      to: 'EXTERNAL_WALLET_MANUAL',
      cancelledOpenContributionIds: migration.cancelledOpenContributionIds,
      cancelledPaidContributionIds: migration.cancelledPaidContributionIds,
      historicalMockReceiptsRemain: migration.historicalMockReceiptsRemain,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function execute(action: () => void | Promise<void>) {
    try {
      setError('');
      setBackupStatus('');
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function assertLedgerIntegrity() {
    if (!await verifyLedger(ledgerRef.current)) throw new Error(t('error.ledgerInvalidBlocked'));
  }

  async function record(gameId: string, type: LedgerEventType, payload: Record<string, unknown> = {}) {
    const event = await appendLedgerEvent(ledgerRef.current, { gameId, type, payload });
    const next = [...ledgerRef.current, event];
    ledgerRef.current = next;
    setLedger(next);
  }

  async function recordDonation(gameId: string, sats: number, label?: string) {
    if (!Number.isInteger(sats) || sats <= 0) throw new Error(t('error.donationPositiveInteger'));
    const donation: ProjectDonation = {
      id: crypto.randomUUID(),
      donorLabel: label?.trim() || undefined,
      sats,
      createdAt: new Date().toISOString(),
    };
    setProjectDonations((current) => [...current, donation]);
    await record(gameId, 'PROJECT_DONATION_RECORDED', { donationId: donation.id, sats, donorLabel: donation.donorLabel ?? null, simulated: true });
  }

  function guideAfterBuyIn(playerId: string, nextContributions: readonly Contribution[]) {
    const currentIndex = players.findIndex((player) => player.id === playerId);
    const ordered = currentIndex >= 0 ? [...players.slice(currentIndex + 1), ...players.slice(0, currentIndex + 1)] : players;
    const nextPlayer = ordered.find((player) => !hasPaidBuyInIn(nextContributions, player.id));
    if (game && !isPlayStarted(game) && !nextPlayer) {
      scrollToTarget(players.length < MIN_POKER_PLAYERS ? 'add-player' : 'workflow-guide');
      return;
    }
    scrollToTarget(nextPlayer ? `player-${nextPlayer.id}` : 'workflow-guide');
  }

  /**
   * Resolve the locked BTC/fiat rate for the game being created.
   *
   * Doctrine: an automatic source must produce a FRESH quote (<= 60 s) — if the
   * quote is missing or stale the creation blocks and asks for an explicit
   * refresh; NOIOU never invents a price and never switches to manual on its
   * own. MANUAL needs no network at all: a fully offline EUR/USD cash game is a
   * supported product mode, not a developer escape hatch.
   */
  async function resolveRateForCreation(): Promise<RatePlan> {
    const plan = planRateLock({
      currency,
      provider: rateProvider,
      manualRate,
      manualNote: manualRateNote,
      manualConfirmed: manualRateConfirmed,
      quote: rateQuote,
      nowMs: Date.now(),
      cashOnly,
    });
    if (plan.kind === 'BLOCKED') {
      if (plan.code === 'QUOTE_STALE') throw new Error(t('rate.stale'));
      if (plan.code === 'MANUAL_RATE_MISSING' || plan.code === 'MANUAL_RATE_INVALID') throw new Error(t('error.positiveRateRequired'));
      throw new Error(t('rate.manualConfirm'));
    }
    if (plan.kind === 'NEEDS_QUOTE') {
      // A fetch is attempted at most once per click: no automatic retry loop.
      try {
        const quote = await fetchQuote({
          provider: rateProvider,
          quote: currency === 'SATS' ? 'EUR' : currency,
          isOnline: () => online,
        });
        setRateQuote(quote);
        setRateQuoteError(null);
        return planRateLock({ currency, provider: rateProvider, manualRate, manualNote: manualRateNote, manualConfirmed: manualRateConfirmed, quote, nowMs: Date.now(), cashOnly });
      } catch (caught) {
        // The raw provider error is a technical English string: it must NEVER
        // reach the organizer. Surface it through the rate-source panel (which
        // offers Retry / Change source / Use a manual rate) and raise the
        // localized, explicit message instead.
        const oracleError = caught instanceof PriceOracleError
          ? caught
          : new PriceOracleError('NETWORK', caught instanceof Error ? caught.message : String(caught), rateProvider);
        setRateQuoteError(oracleError);
        setRateQuote(null);
        if (oracleError.code === 'PAIR_UNSUPPORTED') {
          // §15: never invent a cross rate. Say that no automatic source exists
          // for this pair and point at the explicit manual rate.
          throw new Error(`${t('rate.noAutoSourceTitle')} ${t('rate.noAutoSource', { quote: currency === 'SATS' ? 'EUR' : currency })}`);
        }
        const providerName = t(providerLabelKey(rateProvider));
        const network = ['OFFLINE', 'NETWORK', 'TIMEOUT'].includes(oracleError.code);
        throw new Error(network
          ? `${t('rate.offlineTitle')} ${t('rate.offlineBody', { provider: providerName })}`
          : `${t('rate.errorTitle')} ${t('rate.errorBody', { provider: providerName })}`);
      }
    }
    return plan;
  }

  async function startGame() {
    if (buyIn <= 0) throw new Error(t('error.buyInPositive'));
    if (!Number.isInteger(chipsPerBuyIn) || chipsPerBuyIn <= 0) throw new Error(t('error.chipsPositiveInteger'));
    assertReceiveModeAllowed(lightningReceiveMode, RUNTIME.allowMockPayments);
    if (lightningReceiveMode === 'NWC_RECEIVE_ONLY' && currency !== 'SATS') throw new Error(t('error.nwcSatsOnly'));
    if (lightningReceiveMode === 'NWC_RECEIVE_ONLY' && !nwc.connected) throw new Error(t('error.nwcNotConnected'));
    if (dealerEnabled && dealerMode !== 'NONE' && dealerValue < 0) throw new Error(t('error.dealerNegative'));
    if (dealerEnabled && dealerMode === 'PERCENT' && dealerValue > 100) throw new Error(t('error.dealerPercentMax'));
    if (dealerEnabled && dealerPayment === 'LIGHTNING' && !dealerLightningAddress.trim()) throw new Error(t('error.dealerDestinationRequired'));
    if (startupDonationSats < 0 || !Number.isInteger(startupDonationSats)) throw new Error(t('error.startDonationInteger'));

    const ratePlanResolved = await resolveRateForCreation();
    if (ratePlanResolved.kind === 'BLOCKED') throw new Error(t('error.positiveRateRequired'));
    const lockedRate = ratePlanResolved.kind === 'MANUAL' || ratePlanResolved.kind === 'AUTO' ? ratePlanResolved.locked : undefined;
    const normalizedDealerDestination = dealerEnabled && dealerPayment === 'LIGHTNING'
      ? normalizeReusableLightningDestination(dealerLightningAddress)
      : undefined;
    const normalizedOrganizerDestination = lightningReceiveMode === 'EXTERNAL_WALLET_MANUAL' && organizerLightningDestination.trim()
      ? normalizeReusableLightningDestination(organizerLightningDestination)
      : undefined;
    const createdAt = new Date().toISOString();
    const created: Game = {
      id: crypto.randomUUID(),
      currency,
      buyInAmount: buyIn,
      rebuyEnabled: true,
      rebuyAmount: buyIn,
      chipsPerBuyIn,
      chipValue: buyIn / chipsPerBuyIn,
      status: 'OPEN',
      dealer: dealerEnabled ? {
        enabled: true,
        mode: dealerMode,
        value: dealerMode === 'NONE' ? undefined : dealerValue,
        label: dealerLabel.trim() || 'Dealer',
        preferredPayment: dealerPayment,
        lightningAddress: normalizedDealerDestination,
      } : { enabled: false, mode: 'NONE' },
      lightningReceiveMode,
      organizerLightningDestination: normalizedOrganizerDestination,
      // The lock happens exactly here; nothing below this line ever changes it.
      lockedBtcFiatRate: lockedRate?.rate,
      lockedRate,
      // Declared cash-only: no rate was needed and no Lightning conversion is
      // available on this game (the flag is optional, so legacy games and
      // backups stay readable byte-for-byte).
      cashOnly: cashOnly || undefined,
      createdAt,
      lobbyVersion: 1,
    };
    setGame(created);
    await record(created.id, 'GAME_CREATED', {
      currency: created.currency,
      buyInAmount: created.buyInAmount,
      chipsPerBuyIn: created.chipsPerBuyIn,
      chipValueLegacy: created.chipValue,
      lockedBtcFiatRate: created.lockedBtcFiatRate ?? null,
      rateProvider: lockedRate?.provider ?? null,
      cashOnly: Boolean(created.cashOnly),
      dealer: created.dealer,
      lightningReceiveMode: created.lightningReceiveMode,
      organizerDestinationConfigured: Boolean(created.organizerLightningDestination),
      lobbyVersion: created.lobbyVersion,
    });
    if (lockedRate) {
      // Auditable rate event: the provider, pair, quote values and timestamps
      // are chained into the ledger; a manual rate is immediately identifiable.
      await record(created.id, 'PRICE_RATE_LOCKED', priceRateLockedPayload(lockedRate));
    }
    if (startupDonationSats > 0) await recordDonation(created.id, startupDonationSats, 'Organisateur');
    scrollToTarget('add-player');
  }

  async function addPlayer() {
    if (!game || game.status !== 'OPEN') throw new Error(t('error.gameMustBeOpen'));
    const cleanNickname = nickname.trim();
    if (!cleanNickname) throw new Error(t('error.nicknameRequired'));
    if (players.some((player) => player.nickname.toLocaleLowerCase() === cleanNickname.toLocaleLowerCase())) throw new Error(t('error.nicknameTaken'));
    if (isOrganizerPlayer && players.some((player) => player.isOrganizer)) throw new Error(t('error.organizerAlready'));

    const normalizedLightningDestination = lightningAddress.trim()
      ? normalizeReusableLightningDestination(lightningAddress)
      : undefined;
    const player: Player = {
      id: crypto.randomUUID(),
      nickname: cleanNickname,
      preferredPayment,
      lightningAddress: normalizedLightningDestination,
      isOrganizer: isOrganizerPlayer || undefined,
    };
    setPlayers((current) => [...current, player]);
    setNickname('');
    setLightningAddress('');
    setIsOrganizerPlayer(false);
    await record(game.id, 'PLAYER_JOINED', {
      playerId: player.id,
      nickname: player.nickname,
      preferredPayment: player.preferredPayment,
      reusableLightningDestination: Boolean(player.lightningAddress),
      isOrganizer: Boolean(player.isOrganizer),
    });
  }

  function hasPaidBuyIn(playerId: string): boolean {
    return hasPaidBuyInIn(contributions, playerId);
  }

  function hasOpenBuyIn(playerId: string): boolean {
    return contributions.some((contribution) => contribution.playerId === playerId && contribution.kind === 'BUYIN' && contribution.status !== 'CANCELLED');
  }

  async function beginPlay() {
    if (!game || game.status !== 'OPEN') throw new Error(t('error.gameMustBePreparing'));
    if (isPlayStarted(game)) return;
    await assertLedgerIntegrity();
    const readiness = lobbyReadiness(players, contributions);
    if (!readiness.minimumPlayersMet) throw new Error(t('error.minimumPlayers', { minimum: MIN_POKER_PLAYERS }));
    if (readiness.pendingFinancialAction) throw new Error(t('error.pendingConfirmation'));
    if (!readiness.allInitialCavesPaid) throw new Error(t('error.allCavesRequired'));
    const startedAt = new Date().toISOString();
    setGame({ ...game, startedAt });
    await record(game.id, 'GAME_STARTED', {
      startedAt,
      players: players.length,
      paidInitialCaves: players.filter((player) => hasPaidBuyInIn(contributions, player.id)).length,
      minimumPlayers: MIN_POKER_PLAYERS,
    });
    scrollToTarget('collections');
  }

  async function addCashContribution(player: Player, kind: ContributionKind) {
    if (!game) throw new Error(t('error.noGame'));
    await assertLedgerIntegrity();
    if (kind === 'BUYIN' && hasOpenBuyIn(player.id)) throw new Error(t('error.buyInAlreadyExists'));
    if (kind === 'REBUY' && !isPlayStarted(game)) throw new Error(t('error.rebuyAfterStart'));
    if (kind === 'REBUY' && !hasPaidBuyIn(player.id)) throw new Error(t('error.initialBuyInFirst'));

    const contribution = createContribution(game, player.id, kind, 'CASH');
    const created = [...contributions, contribution];
    const paid = confirmCashContribution(created, contribution.id);
    setContributions(paid);
    await record(game.id, kind === 'BUYIN' ? 'BUYIN_CREATED' : 'REBUY_CREATED', { contributionId: contribution.id, playerId: player.id, method: 'CASH', amount: contribution.amount, chipsIssued: game.chipsPerBuyIn ?? null });
    await record(game.id, 'CASH_CONFIRMED', { contributionId: contribution.id, playerId: player.id, amount: contribution.amount });
    await record(game.id, 'CONTRIBUTION_PAID', { contributionId: contribution.id, playerId: player.id, method: 'CASH' });
    if (kind === 'BUYIN') guideAfterBuyIn(player.id, paid);
  }

  async function confirmCashRebuy() {
    const player = cashRebuyConfirmation;
    if (!player) return;
    await addCashContribution(player, 'REBUY');
    setCashRebuyConfirmation(null);
  }

  async function addOrganizerContribution(player: Player, kind: ContributionKind) {
    if (!game) throw new Error(t('error.noGame'));
    await assertLedgerIntegrity();
    if (kind === 'REBUY' && !isPlayStarted(game)) throw new Error(t('error.rebuyAfterStart'));
    const allocated = allocateOrganizerWalletContribution(game, player, kind, contributions);
    setContributions(allocated.contributions);
    await record(game.id, kind === 'BUYIN' ? 'BUYIN_CREATED' : 'REBUY_CREATED', {
      contributionId: allocated.contribution.id,
      playerId: player.id,
      method: 'LIGHTNING',
      amount: allocated.contribution.amount,
      sats: allocated.contribution.amount,
      chipsIssued: game.chipsPerBuyIn ?? null,
      source: 'ORGANIZER_WALLET_ALLOCATION',
      noExternalTransfer: true,
    });
    await record(game.id, 'ORGANIZER_WALLET_ALLOCATION', {
      contributionId: allocated.contribution.id,
      playerId: player.id,
      amount: allocated.contribution.amount,
      sats: allocated.contribution.amount,
      reference: allocated.reference,
      noExternalTransfer: true,
      attestation: 'ORGANIZER_FUNDS_ALREADY_IN_WALLET',
    });
    await record(game.id, 'CONTRIBUTION_PAID', {
      contributionId: allocated.contribution.id,
      playerId: player.id,
      method: 'LIGHTNING',
      source: 'ORGANIZER_WALLET_ALLOCATION',
      verification: 'ORGANIZER_ATTESTATION',
      noExternalTransfer: true,
    });
    if (kind === 'BUYIN') guideAfterBuyIn(player.id, allocated.contributions);
  }

  async function confirmOrganizerAllocation() {
    const pending = organizerAllocationConfirmation;
    if (!pending) return;
    await addOrganizerContribution(pending.player, pending.kind);
    setOrganizerAllocationConfirmation(null);
  }

  async function addLightningContribution(player: Player, kind: ContributionKind) {
    if (!game) throw new Error('Aucune partie');
    await assertLedgerIntegrity();
    if (kind === 'BUYIN' && hasOpenBuyIn(player.id)) throw new Error('Une cave existe déjà pour ce joueur');
    if (kind === 'REBUY' && !isPlayStarted(game)) throw new Error('Les recaves (rebuys) sont disponibles après le démarrage de la partie');
    if (kind === 'REBUY' && !hasPaidBuyIn(player.id)) throw new Error('La cave initiale doit être encaissée avant une recave (rebuy)');

    const contribution = createContribution(game, player.id, kind, 'LIGHTNING');
    const sats = toSats(contribution.amount, game);
    if (sats <= 0) throw new Error(t('error.satsTooLow'));
    const receiveMode = game.lightningReceiveMode
      ?? (nwc.connected ? 'NWC_RECEIVE_ONLY' : (RUNTIME.allowMockPayments ? 'MOCK' : 'EXTERNAL_WALLET_MANUAL'));
    assertReceiveModeAllowed(receiveMode, RUNTIME.allowMockPayments);
    const ordinal = contributions.filter((item) => item.playerId === player.id && item.kind === kind).length + 1;
    const traceLabel = buildPaymentTrace(game.id, player.nickname, kind, ordinal);

    if (receiveMode === 'EXTERNAL_WALLET_MANUAL') {
      if (game.currency !== 'SATS') throw new Error(t('error.externalSatsOnly'));
      const manualRequest = await prepareExternalIncomingRequest(game.organizerLightningDestination, sats, traceLabel);
      setContributions(markContributionPending([...contributions, contribution], contribution.id, manualRequest.id));
      setInvoices((current) => ({ ...current, [contribution.id]: manualRequest }));
      await record(game.id, kind === 'BUYIN' ? 'BUYIN_CREATED' : 'REBUY_CREATED', {
        contributionId: contribution.id,
        playerId: player.id,
        method: 'LIGHTNING',
        amount: contribution.amount,
        sats,
        chipsIssued: game.chipsPerBuyIn ?? null,
        source: 'MANUAL_EXTERNAL',
        traceLabel,
      });
      await record(game.id, 'LIGHTNING_MANUAL_REQUEST_CREATED', {
        contributionId: contribution.id,
        reference: manualRequest.id,
        sats,
        requestKind: manualRequest.request ? parseLightningDestination(manualRequest.request).kind : 'BOLT11_REQUIRED',
        preparedBy: manualRequest.preparedBy ?? 'MANUAL_BOLT11_REQUIRED',
        exactAmountBound: parseLightningDestination(manualRequest.request).kind === 'BOLT11_INVOICE',
        traceLabel,
      });
      scrollToTarget(`player-${player.id}`);
      return;
    }

    const memo = traceLabel;
    let invoice: LightningInvoice;
    if (receiveMode === 'NWC_RECEIVE_ONLY') {
      if (!nwc.connected) throw new Error(t('error.nwcReconnectBeforeCreate'));
      const created = await nwc.createInvoice(sats, memo);
      invoice = { ...created, traceLabel, preparedBy: 'NWC' };
    } else {
      const created = await adapterRef.current!.createInvoice(sats, memo);
      invoice = { ...created, traceLabel, preparedBy: 'MOCK' };
    }
    const pending = markContributionPending([...contributions, contribution], contribution.id, invoice.id);
    setContributions(pending);
    setInvoices((current) => ({ ...current, [contribution.id]: invoice }));
    await record(game.id, kind === 'BUYIN' ? 'BUYIN_CREATED' : 'REBUY_CREATED', { contributionId: contribution.id, playerId: player.id, method: 'LIGHTNING', amount: contribution.amount, sats, chipsIssued: game.chipsPerBuyIn ?? null, source: invoice.source ?? 'MOCK', traceLabel });
    await record(game.id, 'LIGHTNING_INVOICE_CREATED', { contributionId: contribution.id, invoiceId: invoice.id, sats, source: invoice.source ?? 'MOCK', traceLabel });
    scrollToTarget(`player-${player.id}`);
  }

  async function setManualReceiptBolt11(contributionId: string, raw: string) {
    const invoice = invoices[contributionId];
    if (!invoice || invoice.source !== 'MANUAL_EXTERNAL') throw new Error(t('error.externalReceiptNotFound'));
    const normalized = parseExactBolt11Invoice(raw, invoice.sats);
    setInvoices((current) => ({
      ...current,
      [contributionId]: {
        ...current[contributionId],
        request: normalized,
        preparedBy: 'MANUAL_BOLT11',
        preparationError: undefined,
      },
    }));
  }

  async function confirmManualLightningContribution(contributionId: string) {
    if (!game) throw new Error('Aucune partie');
    await assertLedgerIntegrity();
    const contribution = contributions.find((item) => item.id === contributionId);
    const invoice = invoices[contributionId];
    if (!contribution?.externalReference || !invoice || invoice.source !== 'MANUAL_EXTERNAL') throw new Error(t('error.externalReceiptNotFound'));
    // UX27 idempotence: a second click/event on an already-confirmed receipt must never
    // append a duplicate payment event; the receipt is already recorded.
    if (contribution.status === 'PAID') return;
    if (contribution.status === 'CANCELLED') throw new Error(t('error.caveCancelledConfirm'));
    if (!invoice.request.trim()) throw new Error(t('error.bolt11RequiredBeforeConfirm'));

    const parsed = parseLightningDestination(invoice.request);
    if (parsed.kind !== 'BOLT11_INVOICE') throw new Error(t('error.qrMustBeBolt11'));
    parseExactBolt11Invoice(invoice.request, invoice.sats);

    const paidContributions = confirmLightningContribution(contributions, contributionId, contribution.externalReference);
    setInvoices((current) => ({ ...current, [contributionId]: { ...current[contributionId], status: 'PAID' } }));
    setContributions(paidContributions);
    await record(game.id, 'LIGHTNING_MANUAL_RECEIPT_CONFIRMED', {
      contributionId,
      playerId: contribution.playerId,
      sats: invoice.sats,
      requestKind: parsed.kind,
      preparedBy: invoice.preparedBy ?? 'MANUAL_BOLT11',
      traceLabel: invoice.traceLabel ?? null,
      verification: 'MANUAL_EXTERNAL_WALLET',
    });
    await record(game.id, 'CONTRIBUTION_PAID', {
      contributionId,
      playerId: contribution.playerId,
      method: 'LIGHTNING',
      invoiceId: contribution.externalReference,
      source: 'MANUAL_EXTERNAL',
      verification: 'MANUAL_EXTERNAL_WALLET',
    });
    if (contribution.kind === 'BUYIN') guideAfterBuyIn(contribution.playerId, paidContributions);
  }

  async function checkLightningContribution(contributionId: string) {
    if (!game) throw new Error('Aucune partie');
    await assertLedgerIntegrity();
    const contribution = contributions.find((item) => item.id === contributionId);
    const invoice = invoices[contributionId];
    if (!contribution?.externalReference || !invoice) throw new Error(t('error.invoiceNotFound'));
    if (invoice.source === 'MANUAL_EXTERNAL') throw new Error(t('error.confirmFromExternalCard'));
    // UX27 idempotence: rechecking an already-paid contribution must not double-credit it.
    if (contribution.status === 'PAID') return;
    if (contribution.status === 'CANCELLED') throw new Error(t('error.caveCancelledCollect'));

    let status: LightningInvoice['status'];
    if (invoice.source === 'NWC') {
      status = await nwc.getInvoiceStatus(invoice);
    } else {
      // UX27 defence in depth: a production build can never mark a fictional request as paid,
      // even if a forged/legacy session smuggled one into the local state.
      assertReceiveModeAllowed('MOCK', RUNTIME.allowMockPayments);
      adapterRef.current!.markInvoicePaid(contribution.externalReference);
      status = await adapterRef.current!.getInvoiceStatus(contribution.externalReference);
    }

    setInvoices((current) => ({ ...current, [contributionId]: { ...current[contributionId], status } }));
    if (status === 'EXPIRED') throw new Error(t('error.invoiceExpired'));
    if (status !== 'PAID') throw new Error(t('error.invoiceNotPaid'));

    const paidContributions = confirmLightningContribution(contributions, contributionId, contribution.externalReference);
    setContributions(paidContributions);
    await record(game.id, 'CONTRIBUTION_PAID', {
      contributionId,
      playerId: contribution.playerId,
      method: 'LIGHTNING',
      invoiceId: contribution.externalReference,
      source: invoice.source ?? 'MOCK',
    });
    if (contribution.kind === 'BUYIN') guideAfterBuyIn(contribution.playerId, paidContributions);
  }

  async function beginSettlement() {
    if (!game || game.status !== 'OPEN') throw new Error(t('error.gameNotOpen'));
    await assertLedgerIntegrity();
    if (!isPlayStarted(game)) throw new Error(t('error.startBeforeFinish'));
    if (players.length < MIN_POKER_PLAYERS) throw new Error(t('error.minimumPlayers', { minimum: MIN_POKER_PLAYERS }));
    if (contributions.some((contribution) => contribution.status === 'CREATED' || contribution.status === 'PENDING')) throw new Error(t('error.pendingRebuy'));
    const unpaid = players.filter((player) => !hasPaidBuyInIn(contributions, player.id));
    if (unpaid.length > 0) throw new Error(t('error.missingInitialCave', { players: unpaid.map((player) => player.nickname).join(', ') }));
    const next = { ...game, status: 'SETTLING' as const };
    setGame(next);
    await record(game.id, 'SETTLEMENT_STARTED', { paidContributions: contributions.filter((contribution) => contribution.status === 'PAID').length, expectedChips: calculateIssuedChips(game, contributions) });
    scrollToTarget('final-stacks');
  }

  async function validateStacks() {
    if (!game || game.status !== 'SETTLING') throw new Error(t('error.gameMustBeSettling'));
    await assertLedgerIntegrity();
    const finalStacks: FinalStack[] = players.map((player) => {
      const chips = stacks[player.id];
      if (chips === undefined) throw new Error(t('error.stackMissing', { player: player.nickname }));
      if (!Number.isInteger(chips) || chips < 0) throw new Error(t('error.stackInvalid', { player: player.nickname }));
      return { playerId: player.id, chips };
    });
    const result = calculateSettlement(game, players, contributions, finalStacks);
    setSettlement(result);
    if (!result.balanced) {
      scrollToTarget('settlement-control');
      return;
    }
    setStacksLocked(true);
    setPayouts(result.payouts);
    await record(game.id, 'FINAL_STACKS_RECORDED', { stacks: finalStacks });
    await record(game.id, 'SETTLEMENT_CALCULATED', {
      issuedChips: result.issuedChips,
      countedChips: result.countedChips,
      distributableAmount: result.distributableAmount,
      dealerCompensation: result.dealerCompensation,
    });
    scrollToTarget('settlements');
  }

  function choosePayoutMethod(player: Player, method: PaymentMethod) {
    setPayouts((current) => current.map((payout) => payout.playerId === player.id && payout.status === 'PENDING'
      ? { ...payout, method, lightningRequest: method === 'LIGHTNING' ? undefined : payout.lightningRequest, execution: undefined }
      : payout));
  }

  function setPayoutBolt11(playerId: string, raw: string) {
    if (!game) throw new Error('Aucune partie');
    const payout = payouts.find((item) => item.playerId === playerId);
    if (!payout || payout.status !== 'PENDING') throw new Error(t('error.payoutNotFound'));
    const sats = toSats(payout.amount, game);
    const normalized = parseExactBolt11Invoice(raw, sats);
    setPayouts((current) => current.map((item) => item.playerId === playerId ? { ...item, method: 'LIGHTNING', lightningRequest: normalized, execution: undefined } : item));
  }

  async function confirmPlayerPayout(payout: Payout) {
    if (!game || !settlement?.balanced) throw new Error(t('error.settlementNotReady'));
    await assertLedgerIntegrity();
    if (payout.status === 'CONFIRMED') return;
    const player = players.find((candidate) => candidate.id === payout.playerId);
    if (!player) throw new Error(t('error.playerNotFound'));
    if (payout.method === 'ANY') throw new Error(t('error.choosePayoutMethod', { player: player.nickname }));

    let sats: number | undefined;
    let requestKind: string | null = null;
    if (payout.method === 'LIGHTNING') {
      sats = toSats(payout.amount, game);
      if (sats <= 0) throw new Error(t('error.lightningZero'));
      const request = payout.lightningRequest;
      if (!request) throw new Error(t('error.exactInvoiceForPlayer', { sats: sats.toLocaleString(locale), player: player.nickname }));
      const parsed = parseLightningDestination(request);
      if (parsed.kind !== 'BOLT11_INVOICE') throw new Error(t('error.payoutMustBeBolt11'));
      parseExactBolt11Invoice(request, sats);
      requestKind = parsed.kind;
    }

    const confirmed = confirmPayout(payouts, payout.playerId);
    setPayouts(confirmed);
    await record(game.id, 'PAYOUT_CONFIRMED', {
      playerId: payout.playerId,
      method: payout.method,
      amount: payout.amount,
      sats: sats ?? null,
      requestKind,
      traceLabel: buildTraceLabel(game.id, player.nickname, t('settlement.title')),
      execution: payout.method === 'LIGHTNING' ? 'MANUAL_EXTERNAL_WALLET' : 'CASH_CONFIRMATION',
    });
    const next = confirmed.find((item) => item.amount > 0 && item.status !== 'CONFIRMED');
    scrollToTarget(next ? `payout-${next.playerId}` : 'workflow-guide');
  }

  async function confirmOrganizerPayoutRetention(payout: Payout) {
    if (!game || !settlement?.balanced) throw new Error(t('error.settlementNotReady'));
    if (game.currency !== 'SATS') throw new Error(t('error.retentionSatsOnly'));
    await assertLedgerIntegrity();
    const player = players.find((candidate) => candidate.id === payout.playerId);
    if (!player?.isOrganizer) throw new Error(t('error.notOrganizerPayout'));
    const confirmed = retainOrganizerPayoutAccounting(payouts, player);
    setPayouts(confirmed);
    await record(game.id, 'ORGANIZER_PAYOUT_RETAINED', {
      playerId: player.id,
      amount: payout.amount,
      sats: Math.round(payout.amount),
      noExternalTransfer: true,
      execution: 'ORGANIZER_WALLET_RETENTION',
    });
    await record(game.id, 'PAYOUT_CONFIRMED', {
      playerId: player.id,
      method: 'LIGHTNING',
      amount: payout.amount,
      sats: Math.round(payout.amount),
      requestKind: null,
      traceLabel: buildTraceLabel(game.id, player.nickname, t('settlement.title')),
      execution: 'ORGANIZER_WALLET_RETENTION',
      noExternalTransfer: true,
    });
    const next = confirmed.find((item) => item.amount > 0 && item.status !== 'CONFIRMED');
    scrollToTarget(next ? `payout-${next.playerId}` : 'workflow-guide');
  }

  async function confirmDealerCompensation() {
    if (!game || !settlement || settlement.dealerCompensation <= 0) return;
    await assertLedgerIntegrity();
    if (dealerPaid) return;
    const method = game.dealer.preferredPayment ?? 'CASH';
    let sats: number | undefined;
    if (method === 'LIGHTNING') {
      if (!game.dealer.lightningAddress) throw new Error(t('error.dealerDestinationMissing'));
      normalizeReusableLightningDestination(game.dealer.lightningAddress);
      sats = toSats(settlement.dealerCompensation, game);
      if (sats <= 0) throw new Error(t('error.dealerLightningZero'));
    }
    setDealerPaid(true);
    await record(game.id, 'DEALER_COMPENSATION_CONFIRMED', {
      amount: settlement.dealerCompensation,
      method,
      sats: sats ?? null,
      execution: method === 'LIGHTNING' ? 'MANUAL_EXTERNAL_WALLET' : 'CASH_CONFIRMATION',
    });
    scrollToTarget('workflow-guide');
  }

  async function closeGame() {
    if (!game || !settlement) throw new Error(t('error.settlementNotReady'));
    await assertLedgerIntegrity();
    const closure = checkGameClosure(settlement, payouts, dealerPaid);
    if (!closure.allowed) throw new Error(closure.reasons.join(' · '));
    setGame({ ...game, status: 'CLOSED' });
    await record(game.id, 'GAME_CLOSED', { payouts: payouts.filter((payout) => payout.amount > 0).length, ledgerEvents: ledgerRef.current.length + 1 });
    scrollToTarget('workflow-guide');
  }

  async function recordDealerTipForPlayer(player: Player) {
    if (!game || game.status !== 'CLOSED') throw new Error(t('error.closeBeforeTip'));
    await assertLedgerIntegrity();
    if (dealerTips.some((tip) => tip.playerId === player.id)) throw new Error(t('error.tipAlreadyRecorded', { player: player.nickname }));
    const amount = dealerTipAmounts[player.id] ?? 0;
    const method = dealerTipMethods[player.id] ?? (game.dealer.preferredPayment === 'LIGHTNING' ? 'LIGHTNING' : 'CASH');
    if (method === 'LIGHTNING') {
      if (!game.dealer.lightningAddress) throw new Error(t('error.dealerDestinationMissing'));
      normalizeReusableLightningDestination(game.dealer.lightningAddress);
    }
    const tip = createDealerTip(game, player.id, amount, method);
    setDealerTips((current) => [...current, tip]);
    await record(game.id, 'DEALER_TIP_RECORDED', {
      tipId: tip.id,
      playerId: player.id,
      amount: tip.amount,
      currency: tip.currency,
      method: tip.method,
      sats: tip.sats ?? null,
      voluntary: true,
      outsidePot: true,
      execution: tip.method === 'LIGHTNING' ? 'MANUAL_EXTERNAL_WALLET' : 'CASH_CONFIRMATION',
    });
  }

  async function addEndDonation() {
    if (!game || game.status !== 'CLOSED') throw new Error(t('error.donationAfterClose'));
    await assertLedgerIntegrity();
    await recordDonation(game.id, donationSats, donorLabel);
    setDonorLabel('');
  }

  async function exportBackup() {
    if (!game) throw new Error(t('error.nothingToBackup'));
    const current = snapshot(new Date().toISOString());
    const raw = await createSessionBackup(current);
    const blob = new Blob([raw], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = backupFilename(current);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setBackupStatus(t('backup.exported'));
  }

  async function importBackup(file: File) {
    if (game && game.status !== 'CLOSED') throw new Error(t('error.closeOrClearBeforeImport'));
    let restored = await parseSessionBackup(await file.text());
    const plan = planMockRetirement(restored, {
      allowMockPayments: RUNTIME.allowMockPayments,
      nwcLocked: sessionRequiresNwcReceipts(restored),
    });
    if (plan.migrated && plan.game) {
      restored = { ...restored, game: plan.game, contributions: plan.contributions };
      setMigrationNotice(t('backup.importedMigrated'));
    }
    // Legacy backups only carried `lockedBtcFiatRate` (no provider): the value
    // is restored as an explicitly documented legacy manual rate. Import NEVER
    // refetches a rate from a provider — history is restored, not refreshed.
    const normalizedGame = normalizeImportedGame(restored.game);
    if (normalizedGame && normalizedGame !== restored.game) {
      restored = { ...restored, game: normalizedGame };
    }
    applySnapshot(restored);
    if (typeof window !== 'undefined') saveSession(window.localStorage, restored);
    setBackupStatus(t('backup.imported'));
  }

  function resetSession() {
    if (typeof window !== 'undefined') clearSession(window.localStorage);
    const emptyLedger: LedgerEvent[] = [];
    ledgerRef.current = emptyLedger;
    adapterRef.current = new MockLightningAdapter();
    setGame(null);
    setPlayers([]);
    setContributions([]);
    setInvoices({});
    setStacks({});
    setStacksLocked(false);
    setSettlement(null);
    setPayouts([]);
    setDealerPaid(false);
    setDealerTips([]);
    setDealerTipAmounts({});
    setDealerTipMethods({});
    setCashRebuyConfirmation(null);
    setOrganizerAllocationConfirmation(null);
    setProjectDonations([]);
    setLedger(emptyLedger);
    setLedgerVerified(true);
    setSessionRestored(false);
    setError('');
    setBackupStatus('');
    setStartupDonationSats(0);
    setDonorLabel('');
    setLightningReceiveMode(defaultReceiveMode(nwc.connected));
    setOrganizerLightningDestination('');
    setIsOrganizerPlayer(false);
    receiveModeTouched.current = false;
  }

  const paidTotal = contributions.filter((contribution) => contribution.status === 'PAID').reduce((sum, contribution) => sum + contribution.amount, 0);
  const pendingCount = contributions.filter((contribution) => contribution.status === 'CREATED' || contribution.status === 'PENDING').length;
  const closure = checkGameClosure(settlement, payouts, dealerPaid);
  const totalDonations = projectDonations.reduce((sum, donation) => sum + donation.sats, 0);
  const step = workflowStep(game);
  const playStarted = isPlayStarted(game);
  const readiness = game?.status === 'OPEN' && !playStarted ? lobbyReadiness(players, contributions) : null;
  const activeReceiveMode = game?.lightningReceiveMode ?? lightningReceiveMode;
  const lightningButtonLabel = activeReceiveMode === 'EXTERNAL_WALLET_MANUAL'
    ? t('lightningButton.external')
    : activeReceiveMode === 'NWC_RECEIVE_ONLY'
      ? (nwc.transportConnected ? t('lightningButton.nwc') : t('lightningButton.nwcReconnect'))
      : (RUNTIME.allowMockPayments ? t('lightningButton.mock') : t('lightningButton.external'));
  const nwcMode = nwc.activeGameLockedToNwc && !nwc.transportConnected
    ? 'RECONNECT_REQUIRED'
    : nwc.liveGameReceiptsArmed && nwc.transportConnected
      ? 'LIVE_ARMED'
      : nwc.transportConnected
        ? 'DIAGNOSTIC'
        : 'MOCK';
  let expectedIssuedChips: number | null = null;
  if (game && (game.status === 'SETTLING' || game.status === 'CLOSED')) {
    try { expectedIssuedChips = calculateIssuedChips(game, contributions); } catch { expectedIssuedChips = null; }
  }
  const organizerPlayer = players.find((player) => player.isOrganizer);

  return (
    <main className="shell">
      <header>
        <div>
          <p className="eyebrow">{t('app.eyebrow')}</p>
          <h1 className="sr-only">NOIOU</h1>
          <div className="app-brand-lockup" aria-hidden="true">
            <img className="app-brand-logo app-brand-logo-light-theme" src="/brand/noiou-logo-on-light.svg" alt="" />
            <img className="app-brand-logo app-brand-logo-dark-theme" src="/brand/noiou-logo-on-dark.svg" alt="" />
          </div>
          <p className="tagline">{t('app.tagline')}</p>
        </div>
        <div className="header-controls">
          <span className="badge">{t('app.nonCustodial')}</span>
          <label className="theme-control">{t('app.theme')}
            <select value={themePreference} onChange={(event) => setThemePreference(event.target.value as ThemePreference)}>
              <option value="AUTO">{t('app.theme.auto')}</option>
              <option value="LIGHT">{t('app.theme.light')}</option>
              <option value="DARK">{t('app.theme.dark')}</option>
            </select>
          </label>
        </div>
      </header>

      <nav className="steps" aria-label={t('app.steps.aria')}>
        {[t('app.steps.configure'), t('app.steps.collect'), t('app.steps.count'), t('app.steps.settle')].map((label, index) => <span key={label} className={step === index + 1 ? 'active' : step > index + 1 ? 'done' : ''}><b>{index + 1}</b>{label}</span>)}
      </nav>

      {sessionRestored && <div className="session-note"><span>{t('session.restored')}</span><button onClick={() => setSessionRestored(false)}>OK</button></div>}
      {migrationNotice && <div className="session-note migration-note"><span>🔄 {migrationNotice}</span><button onClick={() => setMigrationNotice('')}>OK</button></div>}
      {game?.lightningReceiveMode === 'EXTERNAL_WALLET_MANUAL' && <div className="session-note live-note"><span>{t('session.liveExternal')}</span></div>}
      {nwcMode === 'LIVE_ARMED' && <div className="session-note live-note"><span>{t('session.liveNwc', { alias: nwc.connection?.alias ? t('session.liveNwcAlias', { alias: nwc.connection.alias }) : '' })}</span></div>}
      {nwcMode === 'RECONNECT_REQUIRED' && <div className="session-note reconnect-note"><span>{t('session.reconnectRequired')}</span></div>}
      {nwcMode === 'DIAGNOSTIC' && <div className="session-note"><span>{t('session.nwcDiagnostic')}</span></div>}
      {game && <div className="save-note">{t('session.autosave')} {lastSavedAt ? `· ${new Date(lastSavedAt).toLocaleTimeString(locale)}` : ''}</div>}
      {backupStatus && <div className="session-note"><span>{backupStatus}</span><button onClick={() => setBackupStatus('')}>OK</button></div>}
      {error && <div className="alert" role="alert">{error}</div>}

      {!game && (
        <section className="card">
          <div className="section-title"><h2>{t('game.create')}</h2><span>{t('game.create.receiveMode', { mode: receiveModeLabel(lightningReceiveMode, RUNTIME.allowMockPayments) })}</span></div>
          <div className="grid">
            <label>{t('game.currency')}
              <select
                value={currency}
                onChange={(event) => {
                  // An explicit pick is remembered and survives language
                  // changes; it never re-labels an existing game.
                  const next: CreationCurrencyPreference = { auto: false, currency: event.target.value as Currency };
                  setCurrencyPreference(next);
                  if (typeof window !== 'undefined') saveCreationCurrencyPreference(window.localStorage, next);
                }}
              >
                {SUPPORTED_CURRENCIES.map((descriptor) => (
                  <option key={descriptor.code} value={descriptor.code}>
                    {descriptor.code} — {t(descriptor.labelKey)}
                  </option>
                ))}
              </select>
            </label>
            {/* The currency block is a protected zone: the floating shortcuts
                and the settings pill must step aside rather than cover the
                selector, its hint and the cash-only switch below it. Each
                element carries its own marker so the dodge follows the ink
                and never the (tall) grid box. */}
            {currencyPreference.auto && defaultCurrencyForLocale(locale) && <p className="muted currency-default-note" data-floating-safe-zone="currency-default">
              {t('game.currencyDefaultNote', { currency: defaultCurrencyForLocale(locale) ?? '' })}
            </p>}
            {!currencyPreference.auto && <button
              type="button"
              className="currency-reset"
              data-floating-safe-zone="currency-reset"
              onClick={() => {
                const next: CreationCurrencyPreference = { auto: true, currency: defaultCurrencyForLocale(locale) ?? 'EUR' };
                setCurrencyPreference(next);
                if (typeof window !== 'undefined') saveCreationCurrencyPreference(window.localStorage, next);
              }}
            >{t('game.currencyReset')}</button>}
            <label>{t('game.buyInLabel')}
              <div className="amount-input-with-unit">
                <input
                  type="number"
                  min="1"
                  step={amountStepFor(currency)}
                  value={buyIn}
                  aria-label={`${t('game.buyInLabel')} (${currency === 'SATS' ? 'sats' : currency})`}
                  onChange={(event) => setBuyIn(Number(event.target.value))}
                />
                <span className="amount-input-unit" aria-hidden="true">{currency === 'SATS' ? 'sats' : currency}</span>
              </div>
            </label>
            <label>{t('game.chipsPerBuyIn')}
              <input type="number" min="1" step="1" value={chipsPerBuyIn} onChange={(event) => setChipsPerBuyIn(Number(event.target.value))} />
            </label>
            <label className="check" data-floating-safe-zone="cash-only"><input
              type="checkbox"
              checked={cashOnly}
              onChange={(event) => {
                setCashOnly(event.target.checked);
                // Declaring the game cash-only drops any automatic quote: no
                // stale rate may appear pre-filled if the switch is undone.
                if (event.target.checked) {
                  setRateQuote(null);
                  setRateQuoteError(null);
                  setRateFetching(false);
                }
              }}
            /> {t('game.cashOnlyLabel')}</label>
            <p className="muted chip-rule-note">{t('game.chipRuleNote')}</p>
            <RateSourceControl
              currency={currency}
              online={online}
              cashOnly={cashOnly}
              state={{ provider: rateProvider, quote: rateQuote, quoteError: rateQuoteError, fetching: rateFetching, manualRate, manualNote: manualRateNote, manualConfirmed: manualRateConfirmed }}
              onChange={(next) => {
                if (next.provider !== undefined) setRateProvider(next.provider);
                if (next.quote !== undefined) setRateQuote(next.quote);
                if (next.quoteError !== undefined) setRateQuoteError(next.quoteError);
                if (next.fetching !== undefined) setRateFetching(next.fetching);
                if (next.manualRate !== undefined) setManualRate(next.manualRate);
                if (next.manualNote !== undefined) setManualRateNote(next.manualNote);
                if (next.manualConfirmed !== undefined) setManualRateConfirmed(next.manualConfirmed);
              }}
            />
            <label>{t('game.receiveModeLabel')}
              <select value={lightningReceiveMode} onChange={(event) => { receiveModeTouched.current = true; setLightningReceiveMode(event.target.value as LightningReceiveMode); }}>
                {availableReceiveModes(RUNTIME.allowMockPayments).map((mode) => <option key={mode} value={mode}>{receiveModeLabel(mode, RUNTIME.allowMockPayments)}</option>)}
              </select>
            </label>
            {lightningReceiveMode === 'EXTERNAL_WALLET_MANUAL' && <div className="wallet-association" data-floating-safe-zone="lightning-organizer">
              <strong>{t('game.walletLink.title')}</strong>
              <small>{t('game.walletLink.help')}</small>
              <LightningDestinationField
                label={t('game.organizerDestination')}
                value={organizerLightningDestination}
                onChange={setOrganizerLightningDestination}
                optional
                compactHint={t('game.organizerDestinationHint')}
              />
            </div>}
            <label className="check"><input type="checkbox" checked={dealerEnabled} onChange={(event) => setDealerEnabled(event.target.checked)} /> {t('game.dealerPresent')}</label>
            {dealerEnabled && <>
              <label>{t('game.dealerName')}<input value={dealerLabel} onChange={(event) => setDealerLabel(event.target.value)} /></label>
              <label>{t('game.dealerCompensation')}
                <select value={dealerMode} onChange={(event) => setDealerMode(event.target.value as 'NONE' | 'FIXED' | 'PERCENT')}>
                  <option value="NONE">{t('game.dealer.mode.none')}</option>
                  <option value="FIXED">{t('game.dealer.mode.fixed')}</option>
                  <option value="PERCENT">{t('game.dealer.mode.percent')}</option>
                </select>
              </label>
              {dealerMode !== 'NONE' && <label>{dealerMode === 'PERCENT' ? t('game.dealer.percentField') : t('game.dealer.amountField', { currency })}
                <input type="number" min="0" max={dealerMode === 'PERCENT' ? 100 : undefined} value={dealerValue} onChange={(event) => setDealerValue(Number(event.target.value))} />
              </label>}
              <label>{dealerMode === 'NONE' ? t('game.dealer.tipsMode') : t('game.dealer.settlementMode')}
                <select value={dealerPayment} onChange={(event) => setDealerPayment(event.target.value as PaymentMethod)}>
                  <option value="CASH">{t('common.cash')}</option><option value="LIGHTNING">{t('common.lightning')}</option>
                </select>
              </label>
              {dealerPayment === 'LIGHTNING' && <LightningDestinationField
                label={t('game.dealer.destination')}
                value={dealerLightningAddress}
                onChange={setDealerLightningAddress}
                compactHint={t('game.dealer.destinationHint')}
              />}
              {dealerMode === 'NONE' && <p className="muted dealer-mode-note">{t('game.dealer.noneNote')}</p>}
            </>}
          </div>
          {lightningReceiveMode === 'NWC_RECEIVE_ONLY' && <p className="muted">{t('game.nwcLimitNote', { limit: MAX_LIVE_GAME_INVOICE_SATS.toLocaleString(locale) })}</p>}
          {lightningReceiveMode === 'EXTERNAL_WALLET_MANUAL' && <p className="muted impartiality-note">{t('game.impartialityNote')}</p>}
          <details className="donation-options donation-details">
            <summary>{t('donation.title')}</summary>
            <div className="donation-details-body">
              <small>{t('game.startDonation.help')}</small>
              <div className="actions">{[0, 500, 1000, 5000].map((sats) => <button className={startupDonationSats === sats ? 'selected' : ''} key={sats} onClick={() => setStartupDonationSats(sats)}>{sats === 0 ? t('game.startDonation.notNow') : t('common.sats', { value: sats.toLocaleString(locale) })}</button>)}</div>
            </div>
          </details>
          <button className="primary wide" onClick={() => void execute(startGame)}>{t('game.continueToPlayers')}</button>
        </section>
      )}

      {game && <>
        <section className="card status-card sticky-summary">
          <div><strong>{game.status === 'OPEN' && !playStarted ? t('game.status.open.preparing') : game.status === 'OPEN' ? t('game.status.open.playing') : t('game.status.withStatus', { status: statusLabel(game.status, t) })}</strong><small>{game.currency} · {t('game.statusCard.buyIn', { amount: fmt(game.buyInAmount, game.currency) })}</small></div>
          <div><strong>{players.length}</strong><small>{t('game.statusCard.players')}</small></div>
          <div><strong>{fmt(paidTotal, game.currency)}</strong><small>{t('game.statusCard.collected')}</small></div>
          <div><strong>{game.chipsPerBuyIn ?? configuredChipsPerBuyIn(game)}</strong><small>{t('game.statusCard.chipsPerBuyIn')}</small></div>
        </section>
        {/* Locked rate of the ACTIVE game — read-only, impossible to edit, flagged
            « non vérifié » when a manual rate was chosen. A cash-only game locks
            no rate at all, so nothing is shown. */}
        {game.currency !== 'SATS' && game.lockedRate && <LockedRateSummary locked={effectiveLockedRate(game)} />}
        <WorkflowGuide game={game} players={players} contributions={contributions} settlement={settlement} payouts={payouts} dealerPaid={dealerPaid} onStartGame={() => void execute(beginPlay)} />
      </>}

      {game?.status === 'OPEN' && (
        <>
          <section className="card" id="add-player">
            <div className="section-title"><h2>{t('player.add')}</h2><span>{t('player.count', { count: players.length })}</span></div>
            <div className="grid player-form">
              <label>{t('player.nickname')}<input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Alice" /></label>
              <label>{t('player.firstBuyInPayment')}
                <select value={preferredPayment} onChange={(event) => setPreferredPayment(event.target.value as PaymentMethod | 'ANY')}>
                  <option value="CASH">{t('common.cash')}</option><option value="LIGHTNING">{t('common.lightning')}</option><option value="ANY">{t('player.payment.any')}</option>
                </select>
              </label>
              {!organizerPlayer && <label className="check"><input type="checkbox" checked={isOrganizerPlayer} onChange={(event) => setIsOrganizerPlayer(event.target.checked)} /> {t('player.isOrganizer')}</label>}
              {organizerPlayer && <div className="organizer-player-note"><strong>{t('player.organizerAlready', { nickname: organizerPlayer.nickname })}</strong><small>{t('player.organizerAlreadyNote')}</small></div>}
              {isOrganizerPlayer && <div className="organizer-player-note"><strong>{t('player.organizerTitle')}</strong><small>{t('player.organizerNote')}</small></div>}
              {!isOrganizerPlayer && (preferredPayment === 'LIGHTNING' || preferredPayment === 'ANY') && <LightningDestinationField
                label={t('player.destination')}
                value={lightningAddress}
                onChange={setLightningAddress}
                optional
                compactHint={t('player.destinationHint')}
              />}
            </div>
            <button className="wide-mobile" onClick={() => void execute(addPlayer)}>{t('player.addButton')}</button>
          </section>

          <section className="card" id="collections" data-floating-safe-zone="collections">
            <div className="section-title"><h2>{playStarted ? t('collection.title.rebuys') : t('collection.title.initial')}</h2><span>{playStarted ? t('collection.subtitle.playing') : t('collection.subtitle.preparing')}</span></div>
            {players.length === 0 && <p className="muted">{t('collection.empty')}</p>}
            {!playStarted && <div className="lobby-note" id="lobby-start">
              <strong>{players.length < MIN_POKER_PLAYERS ? t('collection.lobby.needPlayers', { count: MIN_POKER_PLAYERS }) : readiness?.canStart ? t('collection.lobby.ready') : t('collection.lobby.preparing')}</strong>
              <small>{players.length < MIN_POKER_PLAYERS ? t('collection.lobby.needPlayersNote') : readiness?.canStart ? t('collection.lobby.readyNote') : t('collection.lobby.preparingNote')}</small>
            </div>}
            {players.map((player) => {
              const playerContributions = contributions.filter((contribution) => contribution.playerId === player.id);
              const buyInPaid = hasPaidBuyIn(player.id);
              const initialMethods = initialBuyInMethods(player.preferredPayment);
              return (
                <div className="player-box" id={`player-${player.id}`} key={player.id}>
                  <div className="player-heading"><div><strong>{player.nickname}</strong>{player.isOrganizer && <span className="organizer-badge">{t('player.badge.organizer')}</span>}<small>{t('player.heading.firstBuyIn', { method: paymentChoiceLabel(player.preferredPayment) })}</small></div><span>{t('player.heading.collected', { count: playerContributions.filter((item) => item.status === 'PAID').length })}</span></div>
                  {!buyInPaid && !hasOpenBuyIn(player.id) && <div className="actions">
                    {initialMethods.includes('CASH') && <button onClick={() => void execute(() => addCashContribution(player, 'BUYIN'))}>{t('buyin.cash_received')}</button>}
                    {initialMethods.includes('LIGHTNING') && (player.isOrganizer && game.currency === 'SATS'
                      ? <button className="organizer-allocation-button" onClick={() => setOrganizerAllocationConfirmation({ player, kind: 'BUYIN' })}>{t('buyin.fromOrganizerWallet')}</button>
                      : <button onClick={() => void execute(() => addLightningContribution(player, 'BUYIN'))}>{t('buyin.requestPayment', { label: lightningButtonLabel })}</button>)}
                  </div>}
                  {playerContributions.map((contribution) => {
                    const invoice = invoices[contribution.id];
                    const organizerAllocation = contribution.externalReference?.startsWith('organizer-allocation:');
                    const sourceLabel = organizerAllocation ? t('contribution.source.organizerWallet') : invoice?.source === 'NWC' ? t('contribution.source.nwc') : invoice?.source === 'MANUAL_EXTERNAL' ? t('contribution.source.external') : invoice?.source === 'MOCK' ? (RUNTIME.allowMockPayments ? t('contribution.source.mock') : t('contribution.source.mockRetired')) : '';
                    return <div className="contribution" key={contribution.id}>
                      <span>{contribution.kind === 'BUYIN' ? t('kind.buyin') : t('kind.rebuy')} · {contribution.method === 'CASH' ? t('method.cash') : t('method.lightning')}{sourceLabel}</span>
                      <strong>{fmt(contribution.amount, game.currency)}</strong>
                      <em className={`state ${contribution.status.toLowerCase()}`}>{statusLabel(contribution.status, t)}</em>
                      {invoice && contribution.status === 'PENDING' && (invoice.source === 'MANUAL_EXTERNAL'
                        ? <ManualExternalLightningReceiptCard
                            request={invoice}
                            onUseBolt11={(raw) => setManualReceiptBolt11(contribution.id, raw)}
                            onConfirmReceived={() => confirmManualLightningContribution(contribution.id)}
                          />
                        : <LightningInvoiceCard invoice={invoice} onSimulatePaid={() => void execute(() => checkLightningContribution(contribution.id))} />)}
                    </div>;
                  })}
                  {playStarted && buyInPaid && <div className="actions rebuy-actions">
                    <button className={rebuyActionClass(player.preferredPayment, 'CASH')} onClick={() => setCashRebuyConfirmation(player)}>{t('rebuy.cash')}</button>
                    {player.isOrganizer && game.currency === 'SATS'
                      ? <button className={rebuyActionClass(player.preferredPayment, 'LIGHTNING')} onClick={() => setOrganizerAllocationConfirmation({ player, kind: 'REBUY' })}>{t('rebuy.fromOrganizerWallet')}</button>
                      : <button className={rebuyActionClass(player.preferredPayment, 'LIGHTNING')} onClick={() => void execute(() => addLightningContribution(player, 'REBUY'))}>{t('rebuy.requestPayment', { label: lightningButtonLabel })}</button>}
                  </div>}
                </div>
              );
            })}
            {playStarted && players.length >= MIN_POKER_PLAYERS && <button className="primary wide" onClick={() => void execute(beginSettlement)}>{t('collection.finishAndCount')}</button>}
          </section>
        </>
      )}

      {(game?.status === 'SETTLING' || game?.status === 'CLOSED') && (
        <>
          <section className="card" id="final-stacks" data-floating-safe-zone="final-stacks">
            <div className="section-title"><h2>{t('stack.title')}</h2><span>{stacksLocked ? t('stack.locked') : t('stack.toCount')}</span></div>
            <p className="stack-explainer">{t('stack.explainer')} {expectedIssuedChips !== null ? t('stack.expected', { count: expectedIssuedChips.toLocaleString(locale) }) : ''}</p>
            {players.map((player) => <div className="row" key={player.id}><div><strong>{player.nickname}</strong><small>{t('stack.remaining')}</small></div><input
              aria-label={t('stack.aria', { player: player.nickname })}
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              disabled={stacksLocked || game.status === 'CLOSED'}
              value={stacks[player.id] ?? ''}
              placeholder="0"
              onChange={(event) => {
                const raw = event.target.value;
                setStacks((current) => {
                  const next = { ...current };
                  if (raw === '') delete next[player.id];
                  else next[player.id] = Number(raw);
                  return next;
                });
              }}
            /></div>)}
            {!stacksLocked && game.status === 'SETTLING' && <button className="primary wide" onClick={() => void execute(validateStacks)}>{t('stack.validate')}</button>}
          </section>

          {settlement && <section id="settlement-control" className={`card ${settlement.balanced ? 'ok' : 'blocked'}`} data-floating-safe-zone="settlement-control">
            <div className="section-title"><h2>{t('settlement.control.title')}</h2><strong>{settlement.balanced ? t('settlement.control.balanced') : t('settlement.control.blocked')}</strong></div>
            <p>{t('settlement.control.counts', { issued: settlement.issuedChips, counted: settlement.countedChips })}</p>
            {!settlement.balanced && <p>{t('settlement.control.difference', { difference: `${settlement.chipDifference > 0 ? '+' : ''}${settlement.chipDifference}` })}</p>}
            {settlement.balanced && <p>{t('settlement.control.validated', { players: fmt(settlement.distributableAmount, game.currency), dealer: fmt(settlement.dealerCompensation, game.currency) })}</p>}
          </section>}

          {settlement?.balanced && <section className="card settlement-card" id="settlements" data-floating-safe-zone="settlement-controls">
            <div className="section-title"><h2>{t('settlement.title')}</h2><span>{t('settlement.subtitle')}</span></div>
            <p className="muted settlement-help">{t('settlement.help')}</p>
            <div className="payouts">{payouts.filter((payout) => payout.amount > 0).map((payout) => {
              const player = players.find((candidate) => candidate.id === payout.playerId)!;
              const payoutDestination = payout.lightningRequest ?? player.lightningAddress;
              return <div className="payout" id={`payout-${payout.playerId}`} key={payout.playerId}>
                <span>{player.nickname}</span>
                <strong>{fmt(payout.amount, game.currency)}</strong>
                <small>{payout.execution === 'ORGANIZER_WALLET_RETENTION' ? t('payout.organizerRetained') : t('payout.methodStatus', { method: payout.method === 'CASH' ? t('method.cash') : payout.method === 'LIGHTNING' ? t('method.lightning') : payout.method, status: statusLabel(payout.status, t) })}</small>
                {game.status !== 'CLOSED' && payout.status !== 'CONFIRMED' && payout.method === 'ANY' && <div className="payout-choice">
                  <strong>{t('payout.askMethod', { player: player.nickname })}</strong>
                  {player.isOrganizer && game.currency === 'SATS' && <div className="organizer-retention">
                    <strong>{t('payout.retention.title')}</strong>
                    <small>{t('payout.retention.help')}</small>
                    <button className="primary" onClick={() => void execute(() => confirmOrganizerPayoutRetention(payout))}>{t('payout.retention.button')}</button>
                  </div>}
                  <div className="actions">
                    <button onClick={() => void execute(() => choosePayoutMethod(player, 'CASH'))}>{t('payout.cash')}</button>
                    <button onClick={() => void execute(() => choosePayoutMethod(player, 'LIGHTNING'))}>{player.isOrganizer ? t('payout.lightning.otherWallet') : t('payout.lightning')}</button>
                  </div>
                </div>}
                {game.status !== 'CLOSED' && payout.status !== 'CONFIRMED' && payout.method === 'CASH' && <button onClick={() => void execute(() => confirmPlayerPayout(payout))}>{t('payout.confirmCash')}</button>}
                {game.status !== 'CLOSED' && payout.status !== 'CONFIRMED' && payout.method === 'LIGHTNING' && <ManualLightningPayoutCard
                  label={player.nickname}
                  destination={payoutDestination}
                  amount={payout.amount}
                  currency={game.currency}
                  lockedBtcFiatRate={game.lockedBtcFiatRate}
                  traceLabel={buildTraceLabel(game.id, player.nickname, t('settlement.title'))}
                  onUseBolt11={(raw) => setPayoutBolt11(player.id, raw)}
                  onConfirm={() => void execute(() => confirmPlayerPayout(payout))}
                />}
              </div>;
            })}</div>
            {settlement.dealerCompensation > 0 && <div className="dealer-line" id="dealer-settlement">
              <div><span>{game.dealer.label ?? t('common.dealer')} · {game.dealer.preferredPayment === 'LIGHTNING' ? t('method.lightning') : t('method.cash')}</span><strong>{fmt(settlement.dealerCompensation, game.currency)}</strong></div>
              {game.dealer.preferredPayment === 'LIGHTNING' && !dealerPaid && game.status !== 'CLOSED' && game.dealer.lightningAddress ? <ManualLightningPayoutCard
                label={game.dealer.label ?? t('common.dealer')}
                destination={game.dealer.lightningAddress}
                amount={settlement.dealerCompensation}
                currency={game.currency}
                lockedBtcFiatRate={game.lockedBtcFiatRate}
                traceLabel={buildTraceLabel(game.id, game.dealer.label ?? t('common.dealer'), t('game.dealerCompensation'))}
                onConfirm={() => void execute(confirmDealerCompensation)}
              /> : <button disabled={dealerPaid || game.status === 'CLOSED'} onClick={() => void execute(confirmDealerCompensation)}>{dealerPaid ? t('payout.dealerPaid') : t('payout.dealerConfirmCash')}</button>}
            </div>}
            {game.dealer.enabled && settlement.dealerCompensation === 0 && <div className="dealer-line dealer-unpaid"><div><span>{game.dealer.label ?? t('common.dealer')}</span><strong>{t('payout.dealerUnpaidAmount')}</strong></div><small>{t('payout.dealerUnpaidNote')}</small></div>}
            {game.status === 'SETTLING' && <><div className={`closure ${closure.allowed ? 'ready' : ''}`}>{closure.allowed ? t('payout.allConfirmed') : closure.reasons.join(' · ')}</div><button className="primary wide" disabled={!closure.allowed} onClick={() => void execute(closeGame)}>{t('settlement.close')}</button></>}
            {game.status === 'CLOSED' && <div className="success">{t('settlement.closed')}</div>}
          </section>}
        </>
      )}

      {game?.status === 'CLOSED' && game.dealer.enabled && (
        <section className="card dealer-tips" data-floating-safe-zone="dealer-tips">
          <div className="section-title"><h2>{t('tip.title')}</h2><span>{t('tip.subtitle')}</span></div>
          <p className="muted">{t('tip.help')}</p>
          {players.map((player) => {
            const existing = dealerTips.find((tip) => tip.playerId === player.id);
            const payout = payouts.find((item) => item.playerId === player.id);
            const amount = dealerTipAmounts[player.id] ?? 0;
            const method = dealerTipMethods[player.id] ?? (game.dealer.preferredPayment === 'LIGHTNING' ? 'LIGHTNING' : 'CASH');
            return <div className="tip-row" key={player.id}>
              <div className="tip-player"><strong>{player.nickname}</strong><small>{t('tip.gain', { amount: fmt(payout?.amount ?? 0, game.currency) })}</small></div>
              {existing ? <div className="tip-recorded"><strong>{fmt(existing.amount, existing.currency)} · {existing.method === 'CASH' ? t('method.cash') : existing.method}</strong><small>{t('tip.recorded')}</small></div> : <div className="tip-form">
                <label>{t('tip.amount')}
                  <input type="number" min={amountStepFor(game.currency)} step={amountStepFor(game.currency)} value={amount || ''} onChange={(event) => setDealerTipAmounts((current) => ({ ...current, [player.id]: Number(event.target.value) }))} placeholder={game.currency === 'SATS' ? '500' : '2'} />
                </label>
                <label>{t('tip.method')}
                  <select value={method} onChange={(event) => setDealerTipMethods((current) => ({ ...current, [player.id]: event.target.value as PaymentMethod }))}>
                    <option value="CASH">{t('method.cash')}</option>
                    <option value="LIGHTNING" disabled={!game.dealer.lightningAddress}>{t('common.lightning')}{!game.dealer.lightningAddress ? t('tip.destinationMissing') : ''}</option>
                  </select>
                </label>
                {method === 'LIGHTNING' && game.dealer.lightningAddress && amount > 0 ? <ManualLightningPayoutCard
                  label={t('tip.label', { player: player.nickname, dealer: game.dealer.label ?? t('common.dealer') })}
                  destination={game.dealer.lightningAddress}
                  amount={amount}
                  currency={game.currency}
                  lockedBtcFiatRate={game.lockedBtcFiatRate}
                  traceLabel={buildTraceLabel(game.id, player.nickname, t('tip.title'))}
                  onConfirm={() => void execute(() => recordDealerTipForPlayer(player))}
                /> : <button disabled={amount <= 0} onClick={() => void execute(() => recordDealerTipForPlayer(player))}>{t('tip.confirmCash')}</button>}
              </div>}
            </div>;
          })}
        </section>
      )}

      <section className="card ledger-card" data-floating-safe-zone="ledger">
        <div className="section-title"><h2>{t('ledger.title')}</h2><strong>{ledgerVerified ? t('ledger.valid') : t('ledger.tampered')}</strong></div>
        <p>{t('ledger.count', { count: ledger.length })}</p>
        {ledger.slice(-5).reverse().map((event) => <div className="ledger-event" key={event.id}><span>#{event.sequence} {event.type}</span><code>{event.hash.slice(0, 12)}…</code></div>)}
      </section>

      <details className="card backup-tools backup-details" data-floating-safe-zone="backup">
        <summary>
          <span><strong>{t('backup.title')}</strong><small>{t('backup.subtitle')}</small></span>
        </summary>
        <div className="backup-details-body">
          <p className="muted">{t('backup.help')}</p>
          <div className="actions">
            <button disabled={!game} onClick={() => void execute(exportBackup)}>{t('backup.export')}</button>
            <button disabled={Boolean(game && game.status !== 'CLOSED')} onClick={() => backupInputRef.current?.click()}>{t('backup.import')}</button>
            <input ref={backupInputRef} hidden type="file" accept="application/json,.json" onChange={(event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = '';
              if (file) void execute(() => importBackup(file));
            }} />
          </div>
        </div>
      </details>

      <section className={`card nwc-preview ${nwcMode === 'RECONNECT_REQUIRED' ? 'nwc-reconnect' : ''}`} data-floating-safe-zone="nwc">
        <div><h2>{t('nwc.title')}</h2><p>{game?.lightningReceiveMode === 'EXTERNAL_WALLET_MANUAL'
          ? t('nwc.body.external')
          : nwcMode === 'LIVE_ARMED'
            ? t('nwc.body.liveArmed', { alias: nwc.connection?.alias ? t('session.nwcAliasSuffix', { alias: nwc.connection.alias }) : '' })
            : nwcMode === 'RECONNECT_REQUIRED'
              ? t('nwc.body.reconnect')
              : nwcMode === 'DIAGNOSTIC'
                ? t('nwc.body.diagnostic')
                : RUNTIME.allowMockPayments
                  ? t('nwc.body.mock')
                  : t('nwc.body.default')}
          </p>
          {/* Mode doctrine: NWC automates INCOMING collections only; every
              outgoing settlement stays manual in the organizer's wallet. */}
          <p className="nwc-boundary"><strong>{game?.lightningReceiveMode === 'EXTERNAL_WALLET_MANUAL' ? t('lightning.mode.external.title') : t('lightning.mode.nwc.title')}</strong>{' — '}{game?.lightningReceiveMode === 'EXTERNAL_WALLET_MANUAL' ? t('lightning.mode.external.body') : t('lightning.mode.nwc.body')}</p>
          <details className="wallet-help">
            <summary>{t('nwc.help.summary')}</summary>
            <p>{t('nwc.help.body')}</p>
            <p>{t('lightning.outgoing.manual')}</p>
          </details>
        </div>
        <span className={`state ${game?.lightningReceiveMode === 'EXTERNAL_WALLET_MANUAL' || nwcMode === 'LIVE_ARMED' ? 'paid' : 'pending'}`}>{game?.lightningReceiveMode === 'EXTERNAL_WALLET_MANUAL' ? t('nwc.state.external') : nwcRuntimeStateLabel(nwcMode, RUNTIME.allowMockPayments)}</span>
      </section>

      <details className="card donation donation-details">
        <summary>{t('donation.title')}</summary>
        <div className="donation-details-body">
          <p>{t('donation.help')}</p>
          <small>{t('donation.summary', { count: projectDonations.length, total: totalDonations.toLocaleString(locale) })}</small>
          {game?.status === 'CLOSED' ? <div className="donation-form"><label>{t('donation.donor')}<input value={donorLabel} onChange={(event) => setDonorLabel(event.target.value)} placeholder="Alice" /></label><label>{t('donation.sats')}<input type="number" min="1" step="1" value={donationSats} onChange={(event) => setDonationSats(Number(event.target.value))} /></label><div className="actions">{[500, 1000, 5000].map((sats) => <button key={sats} onClick={() => setDonationSats(sats)}>{sats.toLocaleString(locale)}</button>)}</div><button onClick={() => void execute(addEndDonation)}>{t('donation.record')}</button></div> : <span className="muted">{t('donation.later')}</span>}
        </div>
      </details>

      {game?.status === 'CLOSED' && <section className="card"><div className="section-title"><h2>{t('evening.title')}</h2><span>{t('evening.subtitle')}</span></div><p className="muted">{t('evening.help')}</p><button onClick={resetSession}>{t('evening.reset')}</button></section>}

      <ConfirmDialog
        open={Boolean(cashRebuyConfirmation && game)}
        title={t('dialog.rebuy.title')}
        message={cashRebuyConfirmation && game ? t('dialog.rebuy.message', { amount: fmt(game.rebuyAmount ?? game.buyInAmount, game.currency), player: cashRebuyConfirmation.nickname }) : ''}
        confirmLabel={t('dialog.rebuy.confirm')}
        onCancel={() => setCashRebuyConfirmation(null)}
        onConfirm={() => void execute(confirmCashRebuy)}
      />

      <ConfirmDialog
        open={Boolean(organizerAllocationConfirmation && game)}
        title={organizerAllocationConfirmation?.kind === 'REBUY' ? t('dialog.organizerRebuy.title') : t('dialog.organizerBuyIn.title')}
        message={organizerAllocationConfirmation && game ? t('dialog.organizerAllocation.message', { amount: fmt(organizerAllocationConfirmation.kind === 'REBUY' ? (game.rebuyAmount ?? game.buyInAmount) : game.buyInAmount, game.currency), player: organizerAllocationConfirmation.player.nickname }) : ''}
        confirmLabel={t('dialog.organizerAllocation.confirm')}
        onCancel={() => setOrganizerAllocationConfirmation(null)}
        onConfirm={() => void execute(confirmOrganizerAllocation)}
      />
    </main>
  );
}
