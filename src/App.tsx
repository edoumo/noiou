import { useEffect, useRef, useState } from 'react';
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
  clearSession,
  loadSession,
  saveSession,
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

function formatAmount(amount: number, currency: Currency): string {
  if (currency === 'SATS') return `${Math.round(amount).toLocaleString('fr-FR')} sats`;
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(amount);
}

function toSats(amount: number, game: Game): number {
  if (game.currency === 'SATS') return Math.round(amount);
  if (!game.lockedBtcFiatRate || game.lockedBtcFiatRate <= 0) throw new Error('Le taux BTC/fiat verrouillé est manquant');
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

function receiveModeLabel(mode: LightningReceiveMode): string {
  if (mode === 'NWC_RECEIVE_ONLY') return 'NWC automatique';
  if (mode === 'EXTERNAL_WALLET_MANUAL') return 'Wallet externe manuel';
  return 'Mock';
}

function scrollToTarget(id: string) {
  if (typeof document === 'undefined') return;
  window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}

function hasPaidBuyInIn(contributions: readonly Contribution[], playerId: string): boolean {
  return contributions.some((contribution) => contribution.playerId === playerId && contribution.kind === 'BUYIN' && contribution.status === 'PAID');
}

export default function App() {
  const nwc = useNwcSession();
  const [initialSession] = useState<SessionSnapshot | null>(() => readStoredSession());
  const adapterRef = useRef<MockLightningAdapter | null>(null);
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  if (!adapterRef.current) adapterRef.current = new MockLightningAdapter(mockInvoicesOnly(initialSession?.mockInvoices ?? {}));
  const ledgerRef = useRef<LedgerEvent[]>(initialSession?.ledger ?? []);

  const [themePreference, setThemePreference] = useState<ThemePreference>(() => readThemePreference());
  const [currency, setCurrency] = useState<Currency>(initialSession?.game?.currency ?? 'EUR');
  const [buyIn, setBuyIn] = useState(initialSession?.game?.buyInAmount ?? 10);
  const [chipsPerBuyIn, setChipsPerBuyIn] = useState(() => configuredChipsPerBuyIn(initialSession?.game));
  const [btcFiatRate, setBtcFiatRate] = useState(initialSession?.game?.lockedBtcFiatRate ?? 100_000);
  const [lightningReceiveMode, setLightningReceiveMode] = useState<LightningReceiveMode>(initialSession?.game?.lightningReceiveMode ?? 'MOCK');
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
      setCurrency(restored.game.currency);
      setBuyIn(restored.game.buyInAmount);
      setChipsPerBuyIn(configuredChipsPerBuyIn(restored.game));
      setBtcFiatRate(restored.game.lockedBtcFiatRate ?? 100_000);
      setLightningReceiveMode(restored.game.lightningReceiveMode ?? 'MOCK');
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
    if (!await verifyLedger(ledgerRef.current)) throw new Error('Le journal d’audit est invalide : opération financière bloquée');
  }

  async function record(gameId: string, type: LedgerEventType, payload: Record<string, unknown> = {}) {
    const event = await appendLedgerEvent(ledgerRef.current, { gameId, type, payload });
    const next = [...ledgerRef.current, event];
    ledgerRef.current = next;
    setLedger(next);
  }

  async function recordDonation(gameId: string, sats: number, label?: string) {
    if (!Number.isInteger(sats) || sats <= 0) throw new Error('Le don doit être un nombre entier positif de sats');
    const donation: ProjectDonation = {
      id: crypto.randomUUID(),
      donorLabel: label?.trim() || undefined,
      sats,
      createdAt: new Date().toISOString(),
    };
    setProjectDonations((current) => [...current, donation]);
    await record(gameId, 'PROJECT_DONATION_RECORDED', { donationId: donation.id, sats, donorLabel: donation.donorLabel ?? null, mock: true });
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

  async function startGame() {
    if (buyIn <= 0) throw new Error('La cave doit être positive');
    if (!Number.isInteger(chipsPerBuyIn) || chipsPerBuyIn <= 0) throw new Error('Le nombre de jetons par cave doit être un entier positif');
    if (currency !== 'SATS' && btcFiatRate <= 0) throw new Error('Un taux BTC/fiat positif est requis pour les paiements Lightning');
    if (lightningReceiveMode === 'EXTERNAL_WALLET_MANUAL' && currency !== 'SATS') throw new Error('Alpha wallet externe réel : utilise une partie en SATS. EUR/USD restent en mock tant que le modèle monétaire exact n’est pas migré.');
    if (lightningReceiveMode === 'NWC_RECEIVE_ONLY' && !nwc.connected) throw new Error('Connecte et arme explicitement un wallet NWC receive-only avant de préparer une partie en mode NWC réel');
    if (dealerEnabled && dealerMode !== 'NONE' && dealerValue < 0) throw new Error('La rémunération du dealer ne peut pas être négative');
    if (dealerEnabled && dealerMode === 'PERCENT' && dealerValue > 100) throw new Error('Le pourcentage dealer ne peut pas dépasser 100 %');
    if (dealerEnabled && dealerPayment === 'LIGHTNING' && !dealerLightningAddress.trim()) throw new Error('La destination Lightning du dealer est requise');
    if (startupDonationSats < 0 || !Number.isInteger(startupDonationSats)) throw new Error('Le don de démarrage doit être un nombre entier de sats');

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
      lockedBtcFiatRate: currency === 'SATS' ? undefined : btcFiatRate,
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
      dealer: created.dealer,
      lightningReceiveMode: created.lightningReceiveMode,
      organizerDestinationConfigured: Boolean(created.organizerLightningDestination),
      lobbyVersion: created.lobbyVersion,
    });
    if (startupDonationSats > 0) await recordDonation(created.id, startupDonationSats, 'Organisateur');
    scrollToTarget('add-player');
  }

  async function addPlayer() {
    if (!game || game.status !== 'OPEN') throw new Error('La partie doit être ouverte');
    const cleanNickname = nickname.trim();
    if (!cleanNickname) throw new Error('Le pseudo est obligatoire');
    if (players.some((player) => player.nickname.toLocaleLowerCase() === cleanNickname.toLocaleLowerCase())) throw new Error('Ce pseudo est déjà utilisé');
    if (isOrganizerPlayer && players.some((player) => player.isOrganizer)) throw new Error('Un joueur est déjà identifié comme organisateur');

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
    scrollToTarget('add-player');
  }

  function hasPaidBuyIn(playerId: string): boolean {
    return hasPaidBuyInIn(contributions, playerId);
  }

  function hasOpenBuyIn(playerId: string): boolean {
    return contributions.some((contribution) => contribution.playerId === playerId && contribution.kind === 'BUYIN' && contribution.status !== 'CANCELLED');
  }

  async function beginPlay() {
    if (!game || game.status !== 'OPEN') throw new Error('La partie doit être en préparation');
    if (isPlayStarted(game)) return;
    await assertLedgerIntegrity();
    const readiness = lobbyReadiness(players, contributions);
    if (!readiness.minimumPlayersMet) throw new Error(`Le poker nécessite au moins ${MIN_POKER_PLAYERS} joueurs`);
    if (readiness.pendingFinancialAction) throw new Error('Une cave est encore en attente de confirmation');
    if (!readiness.allInitialCavesPaid) throw new Error('Toutes les caves initiales doivent être encaissées avant de démarrer la partie');
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
    if (!game) throw new Error('Aucune partie');
    await assertLedgerIntegrity();
    if (kind === 'BUYIN' && hasOpenBuyIn(player.id)) throw new Error('Une cave existe déjà pour ce joueur');
    if (kind === 'REBUY' && !isPlayStarted(game)) throw new Error('Les rebuys sont disponibles après le démarrage de la partie');
    if (kind === 'REBUY' && !hasPaidBuyIn(player.id)) throw new Error('La cave initiale doit être encaissée avant un rebuy');

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
    if (!game) throw new Error('Aucune partie');
    await assertLedgerIntegrity();
    if (kind === 'REBUY' && !isPlayStarted(game)) throw new Error('Les rebuys sont disponibles après le démarrage de la partie');
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
    if (kind === 'REBUY' && !isPlayStarted(game)) throw new Error('Les rebuys sont disponibles après le démarrage de la partie');
    if (kind === 'REBUY' && !hasPaidBuyIn(player.id)) throw new Error('La cave initiale doit être encaissée avant un rebuy');

    const contribution = createContribution(game, player.id, kind, 'LIGHTNING');
    const sats = toSats(contribution.amount, game);
    if (sats <= 0) throw new Error('Le montant converti en sats est trop faible');
    const receiveMode = game.lightningReceiveMode ?? (nwc.connected ? 'NWC_RECEIVE_ONLY' : 'MOCK');
    const ordinal = contributions.filter((item) => item.playerId === player.id && item.kind === kind).length + 1;
    const traceLabel = buildPaymentTrace(game.id, player.nickname, kind, ordinal);

    if (receiveMode === 'EXTERNAL_WALLET_MANUAL') {
      if (game.currency !== 'SATS') throw new Error('Les encaissements wallet externe réels sont limités aux parties en SATS dans cette alpha');
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
      if (!nwc.connected) throw new Error('Cette partie utilise NWC réel : reconnecte le wallet receive-only avant de créer une nouvelle cave/rebuy');
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
    if (!invoice || invoice.source !== 'MANUAL_EXTERNAL') throw new Error('Encaissement wallet externe introuvable');
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
    if (!contribution?.externalReference || !invoice || invoice.source !== 'MANUAL_EXTERNAL') throw new Error('Encaissement wallet externe introuvable');
    if (!invoice.request.trim()) throw new Error('NOIOU exige une invoice BOLT11 du montant exact avant confirmation');

    const parsed = parseLightningDestination(invoice.request);
    if (parsed.kind !== 'BOLT11_INVOICE') throw new Error('Demande refusée : le QR présenté doit être une invoice BOLT11 liée au montant exact');
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
    if (!contribution?.externalReference || !invoice) throw new Error('Invoice introuvable');
    if (invoice.source === 'MANUAL_EXTERNAL') throw new Error('Cet encaissement doit être confirmé explicitement depuis la carte wallet externe');

    let status: LightningInvoice['status'];
    if (invoice.source === 'NWC') {
      status = await nwc.getInvoiceStatus(invoice);
    } else {
      adapterRef.current!.markInvoicePaid(contribution.externalReference);
      status = await adapterRef.current!.getInvoiceStatus(contribution.externalReference);
    }

    setInvoices((current) => ({ ...current, [contributionId]: { ...current[contributionId], status } }));
    if (status === 'EXPIRED') throw new Error('Invoice Lightning expirée : génère une nouvelle demande avant de réessayer');
    if (status !== 'PAID') throw new Error('Invoice non payée : NOIOU ne crédite aucun jeton tant que le paiement n’est pas confirmé');

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
    if (!game || game.status !== 'OPEN') throw new Error('La partie n’est pas ouverte');
    await assertLedgerIntegrity();
    if (!isPlayStarted(game)) throw new Error('Démarre réellement la partie avant de pouvoir la terminer');
    if (players.length < MIN_POKER_PLAYERS) throw new Error(`Le poker nécessite au moins ${MIN_POKER_PLAYERS} joueurs`);
    if (contributions.some((contribution) => contribution.status === 'CREATED' || contribution.status === 'PENDING')) throw new Error('Une cave ou un rebuy est encore en attente');
    const unpaid = players.filter((player) => !hasPaidBuyInIn(contributions, player.id));
    if (unpaid.length > 0) throw new Error(`Cave initiale manquante : ${unpaid.map((player) => player.nickname).join(', ')}`);
    const next = { ...game, status: 'SETTLING' as const };
    setGame(next);
    await record(game.id, 'SETTLEMENT_STARTED', { paidContributions: contributions.filter((contribution) => contribution.status === 'PAID').length, expectedChips: calculateIssuedChips(game, contributions) });
    scrollToTarget('final-stacks');
  }

  async function validateStacks() {
    if (!game || game.status !== 'SETTLING') throw new Error('La partie doit être en règlement');
    await assertLedgerIntegrity();
    const finalStacks: FinalStack[] = players.map((player) => {
      const chips = stacks[player.id];
      if (chips === undefined) throw new Error(`Renseigne les jetons restants de ${player.nickname}. Saisis 0 si le joueur n’a plus aucun jeton.`);
      if (!Number.isInteger(chips) || chips < 0) throw new Error(`Le nombre de jetons de ${player.nickname} doit être un entier positif ou nul.`);
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
    if (!payout || payout.status !== 'PENDING') throw new Error('Payout introuvable');
    const sats = toSats(payout.amount, game);
    const normalized = parseExactBolt11Invoice(raw, sats);
    setPayouts((current) => current.map((item) => item.playerId === playerId ? { ...item, method: 'LIGHTNING', lightningRequest: normalized, execution: undefined } : item));
  }

  async function confirmPlayerPayout(payout: Payout) {
    if (!game || !settlement?.balanced) throw new Error('Le règlement n’est pas prêt');
    await assertLedgerIntegrity();
    if (payout.status === 'CONFIRMED') return;
    const player = players.find((candidate) => candidate.id === payout.playerId);
    if (!player) throw new Error('Joueur introuvable');
    if (payout.method === 'ANY') throw new Error(`Choisis d’abord le mode de règlement de ${player.nickname}`);

    let sats: number | undefined;
    let requestKind: string | null = null;
    if (payout.method === 'LIGHTNING') {
      sats = toSats(payout.amount, game);
      if (sats <= 0) throw new Error('Le paiement Lightning converti vaut 0 sat');
      const request = payout.lightningRequest;
      if (!request) throw new Error(`NOIOU attend une invoice BOLT11 exacte de ${sats.toLocaleString('fr-FR')} sats pour ${player.nickname}`);
      const parsed = parseLightningDestination(request);
      if (parsed.kind !== 'BOLT11_INVOICE') throw new Error('Paiement refusé : la demande du bénéficiaire doit être une invoice BOLT11 du montant exact');
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
      traceLabel: buildTraceLabel(game.id, player.nickname, 'Règlement'),
      execution: payout.method === 'LIGHTNING' ? 'MANUAL_EXTERNAL_WALLET' : 'CASH_CONFIRMATION',
    });
    const next = confirmed.find((item) => item.amount > 0 && item.status !== 'CONFIRMED');
    scrollToTarget(next ? `payout-${next.playerId}` : 'workflow-guide');
  }

  async function confirmOrganizerPayoutRetention(payout: Payout) {
    if (!game || !settlement?.balanced) throw new Error('Le règlement n’est pas prêt');
    if (game.currency !== 'SATS') throw new Error('La conservation dans le wallet organisateur est disponible uniquement pour une partie en SATS');
    await assertLedgerIntegrity();
    const player = players.find((candidate) => candidate.id === payout.playerId);
    if (!player?.isOrganizer) throw new Error('Ce payout n’appartient pas au joueur organisateur');
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
      traceLabel: buildTraceLabel(game.id, player.nickname, 'Règlement'),
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
      if (!game.dealer.lightningAddress) throw new Error('Destination Lightning du dealer manquante');
      normalizeReusableLightningDestination(game.dealer.lightningAddress);
      sats = toSats(settlement.dealerCompensation, game);
      if (sats <= 0) throw new Error('La rémunération Lightning du dealer vaut 0 sat');
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
    if (!game || !settlement) throw new Error('Le règlement n’est pas prêt');
    await assertLedgerIntegrity();
    const closure = checkGameClosure(settlement, payouts, dealerPaid);
    if (!closure.allowed) throw new Error(closure.reasons.join(' · '));
    setGame({ ...game, status: 'CLOSED' });
    await record(game.id, 'GAME_CLOSED', { payouts: payouts.filter((payout) => payout.amount > 0).length, ledgerEvents: ledgerRef.current.length + 1 });
    scrollToTarget('workflow-guide');
  }

  async function recordDealerTipForPlayer(player: Player) {
    if (!game || game.status !== 'CLOSED') throw new Error('Clôture la partie avant d’enregistrer un tip dealer');
    await assertLedgerIntegrity();
    if (dealerTips.some((tip) => tip.playerId === player.id)) throw new Error(`${player.nickname} a déjà un tip dealer enregistré`);
    const amount = dealerTipAmounts[player.id] ?? 0;
    const method = dealerTipMethods[player.id] ?? (game.dealer.preferredPayment === 'LIGHTNING' ? 'LIGHTNING' : 'CASH');
    if (method === 'LIGHTNING') {
      if (!game.dealer.lightningAddress) throw new Error('Destination Lightning du dealer manquante');
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
    if (!game || game.status !== 'CLOSED') throw new Error('Les dons de fin sont proposés après clôture');
    await assertLedgerIntegrity();
    await recordDonation(game.id, donationSats, donorLabel);
    setDonorLabel('');
  }

  async function exportBackup() {
    if (!game) throw new Error('Aucune partie à sauvegarder');
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
    setBackupStatus('Sauvegarde exportée et contrôlée.');
  }

  async function importBackup(file: File) {
    if (game && game.status !== 'CLOSED') throw new Error('Clôture ou efface la partie active avant d’importer une sauvegarde');
    const restored = await parseSessionBackup(await file.text());
    applySnapshot(restored);
    if (typeof window !== 'undefined') saveSession(window.localStorage, restored);
    setBackupStatus('Sauvegarde importée · intégrité et journal vérifiés.');
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
    setLightningReceiveMode('MOCK');
    setOrganizerLightningDestination('');
    setIsOrganizerPlayer(false);
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
    ? 'Lightning'
    : activeReceiveMode === 'NWC_RECEIVE_ONLY'
      ? (nwc.transportConnected ? 'NWC réel' : 'NWC réel · reconnecter')
      : 'Lightning mock';
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
          <p className="eyebrow">Private alpha · physical table</p>
          <h1>NOIOU</h1>
          <p className="tagline">La partie reste physique. NOIOU s’occupe seulement de la caisse et du règlement.</p>
        </div>
        <div className="header-controls">
          <span className="badge">Non-custodial by design</span>
          <label className="theme-control">Thème
            <select value={themePreference} onChange={(event) => setThemePreference(event.target.value as ThemePreference)}>
              <option value="AUTO">Auto</option>
              <option value="LIGHT">Clair</option>
              <option value="DARK">Sombre</option>
            </select>
          </label>
        </div>
      </header>

      <nav className="steps" aria-label="Étapes de la partie">
        {['Configurer', 'Encaisser', 'Compter', 'Régler'].map((label, index) => <span key={label} className={step === index + 1 ? 'active' : step > index + 1 ? 'done' : ''}><b>{index + 1}</b>{label}</span>)}
      </nav>

      {sessionRestored && <div className="session-note"><span>Session locale restaurée · aucun secret wallet n’est stocké. Une invoice NWC en attente nécessite de reconnecter le wallet pour vérifier son paiement.</span><button onClick={() => setSessionRestored(false)}>OK</button></div>}
      {game?.lightningReceiveMode === 'EXTERNAL_WALLET_MANUAL' && <div className="session-note live-note"><span>⚡ Wallet Lightning externe : NOIOU prépare ou vérifie une invoice du montant exact avant de l’afficher au joueur. L’organisateur confirme la réception uniquement après vérification dans son wallet.</span></div>}
      {nwcMode === 'LIVE_ARMED' && <div className="session-note live-note"><span>⚡ Réception NWC réelle armée{nwc.connection?.alias ? ` · ${nwc.connection.alias}` : ''}. Les caves/rebuys créditent directement le wallet de l’organisateur. Les payouts restent manuels hors NOIOU.</span></div>}
      {nwcMode === 'RECONNECT_REQUIRED' && <div className="session-note reconnect-note"><span>⚠️ Cette partie est verrouillée en NWC réel mais le wallet est déconnecté. Reconnecte le même wallet receive-only avant toute nouvelle cave/rebuy ou vérification d’invoice.</span></div>}
      {nwcMode === 'DIAGNOSTIC' && <div className="session-note"><span>Wallet NWC connecté en diagnostic uniquement. Les caves de partie ne deviennent NWC réelles que si tu sélectionnes NWC automatique et armes explicitement la réception.</span></div>}
      {game && <div className="save-note">Sauvegarde locale automatique {lastSavedAt ? `· ${new Date(lastSavedAt).toLocaleTimeString('fr-FR')}` : ''}</div>}
      {backupStatus && <div className="session-note"><span>{backupStatus}</span><button onClick={() => setBackupStatus('')}>OK</button></div>}
      {error && <div className="alert" role="alert">{error}</div>}

      <section className="card backup-tools">
        <div><strong>Sauvegarde portable</strong><small>JSON contrôlé par SHA-256 + vérification du journal. Aucun secret NWC n’est exporté.</small></div>
        <div className="actions">
          <button disabled={!game} onClick={() => void execute(exportBackup)}>Exporter</button>
          <button disabled={Boolean(game && game.status !== 'CLOSED')} onClick={() => backupInputRef.current?.click()}>Importer</button>
          <input ref={backupInputRef} hidden type="file" accept="application/json,.json" onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = '';
            if (file) void execute(() => importBackup(file));
          }} />
        </div>
      </section>

      {!game && (
        <section className="card">
          <div className="section-title"><h2>Créer la partie</h2><span>Réception Lightning : {receiveModeLabel(lightningReceiveMode)}</span></div>
          <div className="grid">
            <label>Devise de la partie
              <select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}>
                <option value="EUR">EUR</option><option value="USD">USD</option><option value="SATS">SATS</option>
              </select>
            </label>
            <label>Cave / rebuy
              <input type="number" min="1" step={currency === 'SATS' ? 1 : 0.01} value={buyIn} onChange={(event) => setBuyIn(Number(event.target.value))} />
            </label>
            <label>Jetons remis par cave
              <input type="number" min="1" step="1" value={chipsPerBuyIn} onChange={(event) => setChipsPerBuyIn(Number(event.target.value))} />
            </label>
            <p className="muted chip-rule-note">Argent et jetons sont deux grandeurs séparées. Exemple : une cave de 100 sats peut remettre 10 jetons. À la fin, NOIOU doit retrouver exactement les jetons réellement émis.</p>
            {currency !== 'SATS' && <label>Taux BTC/{currency} verrouillé (prototype)
              <input type="number" min="1" value={btcFiatRate} onChange={(event) => setBtcFiatRate(Number(event.target.value))} />
            </label>}
            <label>Réception Lightning des caves
              <select value={lightningReceiveMode} onChange={(event) => setLightningReceiveMode(event.target.value as LightningReceiveMode)}>
                <option value="MOCK">Mock / test</option>
                <option value="NWC_RECEIVE_ONLY">NWC automatique</option>
                <option value="EXTERNAL_WALLET_MANUAL">Wallet externe manuel</option>
              </select>
            </label>
            {lightningReceiveMode === 'EXTERNAL_WALLET_MANUAL' && <div className="wallet-association">
              <strong>Associer le wallet organisateur</strong>
              <small>Cette destination identifie où les caves doivent arriver. NOIOU essaie ensuite de générer lui-même une invoice exacte pour chaque joueur lorsque le protocole le permet.</small>
              <LightningDestinationField
                label="Destination Lightning de l’organisateur"
                value={organizerLightningDestination}
                onChange={setOrganizerLightningDestination}
                optional
                compactHint="Optionnelle. Lightning Address, BOLT12 ou LNURL réutilisable. Sans génération automatique possible, NOIOU exigera une invoice BOLT11 du montant exact."
              />
            </div>}
            <label className="check"><input type="checkbox" checked={dealerEnabled} onChange={(event) => setDealerEnabled(event.target.checked)} /> Dealer présent</label>
            {dealerEnabled && <>
              <label>Nom du dealer<input value={dealerLabel} onChange={(event) => setDealerLabel(event.target.value)} /></label>
              <label>Rémunération du dealer
                <select value={dealerMode} onChange={(event) => setDealerMode(event.target.value as 'NONE' | 'FIXED' | 'PERCENT')}>
                  <option value="NONE">Non rémunéré</option>
                  <option value="FIXED">Montant fixe</option>
                  <option value="PERCENT">Pourcentage du pot</option>
                </select>
              </label>
              {dealerMode !== 'NONE' && <label>{dealerMode === 'PERCENT' ? 'Dealer (%)' : `Dealer (${currency})`}
                <input type="number" min="0" max={dealerMode === 'PERCENT' ? 100 : undefined} value={dealerValue} onChange={(event) => setDealerValue(Number(event.target.value))} />
              </label>}
              <label>{dealerMode === 'NONE' ? 'Mode préféré pour les tips' : 'Règlement dealer'}
                <select value={dealerPayment} onChange={(event) => setDealerPayment(event.target.value as PaymentMethod)}>
                  <option value="CASH">Espèces</option><option value="LIGHTNING">Lightning</option>
                </select>
              </label>
              {dealerPayment === 'LIGHTNING' && <LightningDestinationField
                label="Destination Lightning dealer"
                value={dealerLightningAddress}
                onChange={setDealerLightningAddress}
                compactHint="Adresse user@domain, offre BOLT12, LNURL ou QR réutilisable."
              />}
              {dealerMode === 'NONE' && <p className="muted dealer-mode-note">Aucune somme ne sera retirée du pot. Après clôture, chaque joueur pourra enregistrer un tip volontaire séparé.</p>}
            </>}
          </div>
          {lightningReceiveMode === 'NWC_RECEIVE_ONLY' && <p className="muted">NWC réel exige un wallet connecté et explicitement armé. Chaque invoice de cave/rebuy est plafonnée à {MAX_LIVE_GAME_INVOICE_SATS.toLocaleString('fr-FR')} sats.</p>}
          {lightningReceiveMode === 'EXTERNAL_WALLET_MANUAL' && <p className="muted impartiality-note">Compatible par capacité, pas par marque. Une Lightning Address ou un LNURL peut permettre à NOIOU de demander automatiquement une invoice exacte ; sinon le fallback est une BOLT11 du montant exact, vérifiée avant affichage.</p>}
          <details className="donation-options donation-details">
            <summary>❤️ Soutenir NOIOU</summary>
            <div className="donation-details-body">
              <small>Don volontaire au lancement · mock dans cette alpha · toujours hors cagnotte.</small>
              <div className="actions">{[0, 500, 1000, 5000].map((sats) => <button className={startupDonationSats === sats ? 'selected' : ''} key={sats} onClick={() => setStartupDonationSats(sats)}>{sats === 0 ? 'Pas maintenant' : `${sats.toLocaleString('fr-FR')} sats`}</button>)}</div>
            </div>
          </details>
          <button className="primary wide" onClick={() => void execute(startGame)}>Continuer vers les joueurs</button>
        </section>
      )}

      {game && <>
        <section className="card status-card sticky-summary">
          <div><strong>{game.status === 'OPEN' && !playStarted ? 'Préparation des joueurs' : game.status === 'OPEN' ? 'Partie en cours' : `Partie ${game.status}`}</strong><small>{game.currency} · cave {formatAmount(game.buyInAmount, game.currency)}</small></div>
          <div><strong>{players.length}</strong><small>joueur(s)</small></div>
          <div><strong>{formatAmount(paidTotal, game.currency)}</strong><small>encaissés</small></div>
          <div><strong>{game.chipsPerBuyIn ?? configuredChipsPerBuyIn(game)}</strong><small>jetons / cave</small></div>
        </section>
        <WorkflowGuide game={game} players={players} contributions={contributions} settlement={settlement} payouts={payouts} dealerPaid={dealerPaid} onStartGame={() => void execute(beginPlay)} />
      </>}

      {game?.status === 'OPEN' && (
        <>
          <section className="card" id="add-player">
            <div className="section-title"><h2>Ajouter un joueur</h2><span>{players.length} joueurs</span></div>
            <div className="grid player-form">
              <label>Pseudo<input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Alice" /></label>
              <label>Paiement de la première cave
                <select value={preferredPayment} onChange={(event) => setPreferredPayment(event.target.value as PaymentMethod | 'ANY')}>
                  <option value="CASH">Espèces</option><option value="LIGHTNING">Lightning</option><option value="ANY">Espèces ou Lightning</option>
                </select>
              </label>
              {!organizerPlayer && <label className="check"><input type="checkbox" checked={isOrganizerPlayer} onChange={(event) => setIsOrganizerPlayer(event.target.checked)} /> C’est l’organisateur</label>}
              {organizerPlayer && <div className="organizer-player-note"><strong>Organisateur déjà identifié : {organizerPlayer.nickname}</strong><small>Une seule personne peut être liée au wallet organisateur pour éviter toute ambiguïté comptable.</small></div>}
              {isOrganizerPlayer && <div className="organizer-player-note"><strong>Joueur organisateur</strong><small>En partie SATS, une cave Lightning sera affectée à la cagnotte depuis le wallet organisateur sans transaction vers soi. Le journal l’indiquera explicitement.</small></div>}
              {!isOrganizerPlayer && (preferredPayment === 'LIGHTNING' || preferredPayment === 'ANY') && <LightningDestinationField
                label="Destination Lightning"
                value={lightningAddress}
                onChange={setLightningAddress}
                optional
                compactHint="Optionnelle : adresse @, QR/BOLT12 ou LNURL réutilisable. Sans destination, le joueur pourra fournir une invoice BOLT11 du montant exact au moment du payout."
              />}
            </div>
            <button className="wide-mobile" onClick={() => void execute(addPlayer)}>Ajouter le joueur</button>
          </section>

          <section className="card" id="collections">
            <div className="section-title"><h2>{playStarted ? 'Caves et rebuys' : 'Caves initiales'}</h2><span>{playStarted ? 'partie en cours' : 'préparation avant de jouer'}</span></div>
            {players.length === 0 && <p className="muted">Ajoute les joueurs pour commencer.</p>}
            {!playStarted && <div className="lobby-note" id="lobby-start">
              <strong>{players.length < MIN_POKER_PLAYERS ? `${MIN_POKER_PLAYERS} joueurs minimum pour démarrer` : readiness?.canStart ? 'Tous les joueurs sont prêts' : 'Préparation des caves initiales'}</strong>
              <small>{players.length < MIN_POKER_PLAYERS ? 'Continue à ajouter les participants. NOIOU ne proposera pas de terminer une partie qui n’a pas commencé.' : readiness?.canStart ? 'Utilise « Démarrer la partie » dans le guide ci-dessus. Les rebuys apparaîtront ensuite.' : 'Encaisse chaque première cave. Les rebuys et la fin de partie restent cachés tant que le poker n’a pas commencé.'}</small>
            </div>}
            {players.map((player) => {
              const playerContributions = contributions.filter((contribution) => contribution.playerId === player.id);
              const buyInPaid = hasPaidBuyIn(player.id);
              const initialMethods = initialBuyInMethods(player.preferredPayment);
              return (
                <div className="player-box" id={`player-${player.id}`} key={player.id}>
                  <div className="player-heading"><div><strong>{player.nickname}</strong>{player.isOrganizer && <span className="organizer-badge">Organisateur</span>}<small>1re cave : {paymentChoiceLabel(player.preferredPayment)}</small></div><span>{playerContributions.filter((item) => item.status === 'PAID').length} encaissé(s)</span></div>
                  {!buyInPaid && !hasOpenBuyIn(player.id) && <div className="actions">
                    {initialMethods.includes('CASH') && <button onClick={() => void execute(() => addCashContribution(player, 'BUYIN'))}>Cave espèces reçues</button>}
                    {initialMethods.includes('LIGHTNING') && (player.isOrganizer && game.currency === 'SATS'
                      ? <button className="organizer-allocation-button" onClick={() => setOrganizerAllocationConfirmation({ player, kind: 'BUYIN' })}>Engager depuis le wallet organisateur</button>
                      : <button onClick={() => void execute(() => addLightningContribution(player, 'BUYIN'))}>Faire payer · {lightningButtonLabel}</button>)}
                  </div>}
                  {playerContributions.map((contribution) => {
                    const invoice = invoices[contribution.id];
                    const organizerAllocation = contribution.externalReference?.startsWith('organizer-allocation:');
                    const sourceLabel = organizerAllocation ? ' · wallet organisateur · sans transfert' : invoice?.source === 'NWC' ? ' · NWC réel' : invoice?.source === 'MANUAL_EXTERNAL' ? ' · wallet externe' : invoice ? ' · mock' : '';
                    return <div className="contribution" key={contribution.id}>
                      <span>{contribution.kind} · {contribution.method}{sourceLabel}</span>
                      <strong>{formatAmount(contribution.amount, game.currency)}</strong>
                      <em className={`state ${contribution.status.toLowerCase()}`}>{contribution.status}</em>
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
                    <button className={rebuyActionClass(player.preferredPayment, 'CASH')} onClick={() => setCashRebuyConfirmation(player)}>+ Rebuy espèces</button>
                    {player.isOrganizer && game.currency === 'SATS'
                      ? <button className={rebuyActionClass(player.preferredPayment, 'LIGHTNING')} onClick={() => setOrganizerAllocationConfirmation({ player, kind: 'REBUY' })}>+ Rebuy depuis wallet organisateur</button>
                      : <button className={rebuyActionClass(player.preferredPayment, 'LIGHTNING')} onClick={() => void execute(() => addLightningContribution(player, 'REBUY'))}>+ Rebuy {lightningButtonLabel}</button>}
                  </div>}
                </div>
              );
            })}
            {playStarted && players.length >= MIN_POKER_PLAYERS && <button className="primary wide" onClick={() => void execute(beginSettlement)}>Terminer la partie et compter les jetons</button>}
          </section>
        </>
      )}

      {(game?.status === 'SETTLING' || game?.status === 'CLOSED') && (
        <>
          <section className="card" id="final-stacks">
            <div className="section-title"><h2>Stacks finaux</h2><span>{stacksLocked ? 'verrouillés' : 'à compter'}</span></div>
            <p className="stack-explainer">Compte uniquement les jetons physiques / unités de stack. <strong>Ne saisis pas des sats.</strong> {expectedIssuedChips !== null ? `NOIOU attend ${expectedIssuedChips.toLocaleString('fr-FR')} jetons au total.` : ''}</p>
            {players.map((player) => <div className="row" key={player.id}><div><strong>{player.nickname}</strong><small>Jetons restants</small></div><input
              aria-label={`Jetons ${player.nickname}`}
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
            {!stacksLocked && game.status === 'SETTLING' && <button className="primary wide" onClick={() => void execute(validateStacks)}>Valider le comptage des jetons</button>}
          </section>

          {settlement && <section id="settlement-control" className={`card ${settlement.balanced ? 'ok' : 'blocked'}`}>
            <div className="section-title"><h2>Contrôle impartial NOIOU</h2><strong>{settlement.balanced ? 'ÉQUILIBRÉ ✓' : 'RÈGLEMENT BLOQUÉ'}</strong></div>
            <p>Jetons émis : {settlement.issuedChips} · jetons comptés : {settlement.countedChips}</p>
            {!settlement.balanced && <p>Écart : {settlement.chipDifference > 0 ? '+' : ''}{settlement.chipDifference} jetons. NOIOU bloque le règlement ; corrige le comptage avant de continuer.</p>}
            {settlement.balanced && <p>Conservation validée. Joueurs : {formatAmount(settlement.distributableAmount, game.currency)} · dealer : {formatAmount(settlement.dealerCompensation, game.currency)}</p>}
          </section>}

          {settlement?.balanced && <section className="card settlement-card" id="settlements">
            <div className="section-title"><h2>Règlements</h2><span>NOIOU contrôle le montant ; l’organisateur exécute le paiement</span></div>
            <p className="muted settlement-help">Pour Lightning, NOIOU exige une invoice BOLT11 du montant exact avant confirmation. Avec une Lightning Address ou un LNURL, il essaie de la préparer automatiquement. Aucune permission de dépense n’est donnée à l’application.</p>
            <div className="payouts">{payouts.filter((payout) => payout.amount > 0).map((payout) => {
              const player = players.find((candidate) => candidate.id === payout.playerId)!;
              const payoutDestination = payout.lightningRequest ?? player.lightningAddress;
              return <div className="payout" id={`payout-${payout.playerId}`} key={payout.playerId}>
                <span>{player.nickname}</span>
                <strong>{formatAmount(payout.amount, game.currency)}</strong>
                <small>{payout.execution === 'ORGANIZER_WALLET_RETENTION' ? 'Wallet organisateur · conservé ✓' : `${payout.method} · ${payout.status}`}</small>
                {game.status !== 'CLOSED' && payout.status !== 'CONFIRMED' && payout.method === 'ANY' && <div className="payout-choice">
                  <strong>Comment veux-tu régler {player.nickname} ?</strong>
                  {player.isOrganizer && game.currency === 'SATS' && <div className="organizer-retention">
                    <strong>Aucun transfert vers soi nécessaire</strong>
                    <small>La part gagnée peut simplement rester dans le wallet organisateur. NOIOU l’enregistre comme règlement sans transaction Lightning circulaire.</small>
                    <button className="primary" onClick={() => void execute(() => confirmOrganizerPayoutRetention(payout))}>Conserver dans le wallet organisateur</button>
                  </div>}
                  <div className="actions">
                    <button onClick={() => void execute(() => choosePayoutMethod(player, 'CASH'))}>Espèces</button>
                    <button onClick={() => void execute(() => choosePayoutMethod(player, 'LIGHTNING'))}>{player.isOrganizer ? 'Lightning vers un autre wallet' : 'Lightning'}</button>
                  </div>
                </div>}
                {game.status !== 'CLOSED' && payout.status !== 'CONFIRMED' && payout.method === 'CASH' && <button onClick={() => void execute(() => confirmPlayerPayout(payout))}>Confirmer remise espèces</button>}
                {game.status !== 'CLOSED' && payout.status !== 'CONFIRMED' && payout.method === 'LIGHTNING' && <ManualLightningPayoutCard
                  label={player.nickname}
                  destination={payoutDestination}
                  amount={payout.amount}
                  currency={game.currency}
                  lockedBtcFiatRate={game.lockedBtcFiatRate}
                  traceLabel={buildTraceLabel(game.id, player.nickname, 'Règlement')}
                  onUseBolt11={(raw) => setPayoutBolt11(player.id, raw)}
                  onConfirm={() => void execute(() => confirmPlayerPayout(payout))}
                />}
              </div>;
            })}</div>
            {settlement.dealerCompensation > 0 && <div className="dealer-line" id="dealer-settlement">
              <div><span>{game.dealer.label ?? 'Dealer'} · {game.dealer.preferredPayment ?? 'CASH'}</span><strong>{formatAmount(settlement.dealerCompensation, game.currency)}</strong></div>
              {game.dealer.preferredPayment === 'LIGHTNING' && !dealerPaid && game.status !== 'CLOSED' && game.dealer.lightningAddress ? <ManualLightningPayoutCard
                label={game.dealer.label ?? 'Dealer'}
                destination={game.dealer.lightningAddress}
                amount={settlement.dealerCompensation}
                currency={game.currency}
                lockedBtcFiatRate={game.lockedBtcFiatRate}
                traceLabel={buildTraceLabel(game.id, game.dealer.label ?? 'Dealer', 'Rémunération')}
                onConfirm={() => void execute(confirmDealerCompensation)}
              /> : <button disabled={dealerPaid || game.status === 'CLOSED'} onClick={() => void execute(confirmDealerCompensation)}>{dealerPaid ? 'Confirmé ✓' : 'Confirmer rémunération espèces'}</button>}
            </div>}
            {game.dealer.enabled && settlement.dealerCompensation === 0 && <div className="dealer-line dealer-unpaid"><div><span>{game.dealer.label ?? 'Dealer'}</span><strong>Non rémunéré</strong></div><small>Le pot reste entièrement distribué aux joueurs. Les tips volontaires seront proposés après clôture.</small></div>}
            {game.status === 'SETTLING' && <><div className={`closure ${closure.allowed ? 'ready' : ''}`}>{closure.allowed ? 'Tous les règlements sont confirmés.' : closure.reasons.join(' · ')}</div><button className="primary wide" disabled={!closure.allowed} onClick={() => void execute(closeGame)}>Clôturer la partie</button></>}
            {game.status === 'CLOSED' && <div className="success">Partie clôturée : aucun règlement restant.</div>}
          </section>}
        </>
      )}

      {game?.status === 'CLOSED' && game.dealer.enabled && (
        <section className="card dealer-tips">
          <div className="section-title"><h2>Tip au dealer</h2><span>facultatif · hors pot</span></div>
          <p className="muted">Chaque joueur peut choisir librement un tip. Il ne modifie ni son gain calculé ni la conservation de la partie.</p>
          {players.map((player) => {
            const existing = dealerTips.find((tip) => tip.playerId === player.id);
            const payout = payouts.find((item) => item.playerId === player.id);
            const amount = dealerTipAmounts[player.id] ?? 0;
            const method = dealerTipMethods[player.id] ?? (game.dealer.preferredPayment === 'LIGHTNING' ? 'LIGHTNING' : 'CASH');
            return <div className="tip-row" key={player.id}>
              <div className="tip-player"><strong>{player.nickname}</strong><small>gain : {formatAmount(payout?.amount ?? 0, game.currency)}</small></div>
              {existing ? <div className="tip-recorded"><strong>{formatAmount(existing.amount, existing.currency)} · {existing.method}</strong><small>Tip enregistré ✓</small></div> : <div className="tip-form">
                <label>Montant du tip
                  <input type="number" min={game.currency === 'SATS' ? 1 : 0.01} step={game.currency === 'SATS' ? 1 : 0.01} value={amount || ''} onChange={(event) => setDealerTipAmounts((current) => ({ ...current, [player.id]: Number(event.target.value) }))} placeholder={game.currency === 'SATS' ? '500' : '2'} />
                </label>
                <label>Mode
                  <select value={method} onChange={(event) => setDealerTipMethods((current) => ({ ...current, [player.id]: event.target.value as PaymentMethod }))}>
                    <option value="CASH">Espèces</option>
                    <option value="LIGHTNING" disabled={!game.dealer.lightningAddress}>Lightning{!game.dealer.lightningAddress ? ' · destination manquante' : ''}</option>
                  </select>
                </label>
                {method === 'LIGHTNING' && game.dealer.lightningAddress && amount > 0 ? <ManualLightningPayoutCard
                  label={`Tip de ${player.nickname} → ${game.dealer.label ?? 'Dealer'}`}
                  destination={game.dealer.lightningAddress}
                  amount={amount}
                  currency={game.currency}
                  lockedBtcFiatRate={game.lockedBtcFiatRate}
                  traceLabel={buildTraceLabel(game.id, player.nickname, 'Tip dealer')}
                  onConfirm={() => void execute(() => recordDealerTipForPlayer(player))}
                /> : <button disabled={amount <= 0} onClick={() => void execute(() => recordDealerTipForPlayer(player))}>Confirmer tip remis en espèces</button>}
              </div>}
            </div>;
          })}
        </section>
      )}

      <section className="card ledger-card">
        <div className="section-title"><h2>Journal d’audit</h2><strong>{ledgerVerified ? 'CHAÎNE VALIDE ✓' : 'ALTÉRATION DÉTECTÉE'}</strong></div>
        <p>{ledger.length} événement(s) append-only · SHA-256 chaîné.</p>
        {ledger.slice(-5).reverse().map((event) => <div className="ledger-event" key={event.id}><span>#{event.sequence} {event.type}</span><code>{event.hash.slice(0, 12)}…</code></div>)}
      </section>

      <section className={`card nwc-preview ${nwcMode === 'RECONNECT_REQUIRED' ? 'nwc-reconnect' : ''}`}>
        <div><h2>Lightning organisateur</h2><p>{game?.lightningReceiveMode === 'EXTERNAL_WALLET_MANUAL'
          ? 'Wallet externe manuel actif : NOIOU prépare ou valide un QR exact, puis l’organisateur atteste l’encaissement après vérification dans son wallet.'
          : nwcMode === 'LIVE_ARMED'
            ? `NWC réel armé${nwc.connection?.alias ? ` sur ${nwc.connection.alias}` : ''}. Les caves/rebuys créent de vraies invoices. Les sorties restent manuelles.`
            : nwcMode === 'RECONNECT_REQUIRED'
              ? 'Partie NWC réelle active, wallet déconnecté : reconnecte le même wallet receive-only. Aucun fallback mock.'
              : nwcMode === 'DIAGNOSTIC'
                ? 'Wallet NWC connecté en diagnostic seulement. Sélectionne NWC automatique et arme explicitement la réception pour l’utiliser en partie.'
                : 'Tu peux rester en mock, utiliser NWC receive-only, ou choisir un wallet Lightning externe avec confirmation manuelle.'}
          </p>
          <details className="wallet-help">
            <summary>NWC ou wallet externe : que choisir ?</summary>
            <p>NWC automatise la création et la vérification des invoices entrantes sans permission de dépense. Le mode wallet externe s’appuie sur les capacités Lightning disponibles : NOIOU tente une invoice exacte via Lightning Address/LNURL et utilise sinon une BOLT11 ponctuelle du montant exact.</p>
          </details>
        </div>
        <span className={`state ${game?.lightningReceiveMode === 'EXTERNAL_WALLET_MANUAL' || nwcMode === 'LIVE_ARMED' ? 'paid' : 'pending'}`}>{game?.lightningReceiveMode === 'EXTERNAL_WALLET_MANUAL' ? 'EXTERNE' : nwcMode === 'LIVE_ARMED' ? 'NWC RÉEL' : nwcMode === 'RECONNECT_REQUIRED' ? 'RECONNECTER' : nwcMode === 'DIAGNOSTIC' ? 'DIAGNOSTIC' : 'MOCK'}</span>
      </section>

      <details className="card donation donation-details">
        <summary>❤️ Soutenir NOIOU</summary>
        <div className="donation-details-body">
          <p>Dons volontaires, en sats, toujours hors cagnotte. Prototype : aucune transaction réelle pour les dons.</p>
          <small>{projectDonations.length} don(s) mock · {totalDonations.toLocaleString('fr-FR')} sats au total</small>
          {game?.status === 'CLOSED' ? <div className="donation-form"><label>Donateur (pseudo facultatif)<input value={donorLabel} onChange={(event) => setDonorLabel(event.target.value)} placeholder="Alice" /></label><label>Sats<input type="number" min="1" step="1" value={donationSats} onChange={(event) => setDonationSats(Number(event.target.value))} /></label><div className="actions">{[500, 1000, 5000].map((sats) => <button key={sats} onClick={() => setDonationSats(sats)}>{sats.toLocaleString('fr-FR')}</button>)}</div><button onClick={() => void execute(addEndDonation)}>⚡ Simuler le don</button></div> : <span className="muted">Un autre don pourra être proposé après clôture.</span>}
        </div>
      </details>

      {game?.status === 'CLOSED' && <section className="card"><div className="section-title"><h2>Nouvelle soirée</h2><span>la partie actuelle est terminée</span></div><p className="muted">Exporte la sauvegarde si tu veux conserver une copie portable, puis efface la session locale.</p><button onClick={resetSession}>Effacer cette session locale et créer une nouvelle partie</button></section>}

      <ConfirmDialog
        open={Boolean(cashRebuyConfirmation && game)}
        title="Confirmer le rebuy espèces"
        message={cashRebuyConfirmation && game ? `Confirmer le rebuy de ${formatAmount(game.rebuyAmount ?? game.buyInAmount, game.currency)} pour ${cashRebuyConfirmation.nickname} ?` : ''}
        confirmLabel="Confirmer l’encaissement"
        onCancel={() => setCashRebuyConfirmation(null)}
        onConfirm={() => void execute(confirmCashRebuy)}
      />

      <ConfirmDialog
        open={Boolean(organizerAllocationConfirmation && game)}
        title={organizerAllocationConfirmation?.kind === 'REBUY' ? 'Confirmer le rebuy organisateur' : 'Confirmer la cave organisateur'}
        message={organizerAllocationConfirmation && game ? `Affecter ${formatAmount(organizerAllocationConfirmation.kind === 'REBUY' ? (game.rebuyAmount ?? game.buyInAmount) : game.buyInAmount, game.currency)} déjà présents dans le wallet organisateur à la cagnotte de ${organizerAllocationConfirmation.player.nickname} ? Aucun transfert Lightning vers soi ne sera créé.` : ''}
        confirmLabel="Affecter à la cagnotte"
        onCancel={() => setOrganizerAllocationConfirmation(null)}
        onConfirm={() => void execute(confirmOrganizerAllocation)}
      />
    </main>
  );
}
