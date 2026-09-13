import { useEffect, useRef, useState } from 'react';
import type {
  Contribution,
  ContributionKind,
  Currency,
  FinalStack,
  Game,
  LedgerEvent,
  LedgerEventType,
  PaymentMethod,
  Payout,
  Player,
  ProjectDonation,
  SettlementResult,
} from './domain';
import {
  checkGameClosure,
  confirmCashContribution,
  confirmLightningContribution,
  confirmPayout,
  createContribution,
  markContributionPending,
} from './game';
import { appendLedgerEvent, verifyLedger } from './ledger';
import { MockLightningAdapter, type LightningInvoice } from './lightning';
import {
  clearSession,
  loadSession,
  saveSession,
  SESSION_SCHEMA_VERSION,
  type SessionSnapshot,
} from './session';
import { calculateSettlement } from './settlement';
import './styles.css';

function formatAmount(amount: number, currency: Currency): string {
  if (currency === 'SATS') return `${Math.round(amount).toLocaleString('fr-FR')} sats`;
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(amount);
}

function toSats(amount: number, game: Game): number {
  if (game.currency === 'SATS') return Math.round(amount);
  if (!game.lockedBtcFiatRate || game.lockedBtcFiatRate <= 0) throw new Error('Le taux BTC/fiat verrouillé est manquant');
  return Math.round((amount / game.lockedBtcFiatRate) * 100_000_000);
}

function readStoredSession(): SessionSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    return loadSession(window.localStorage);
  } catch {
    return null;
  }
}

export default function App() {
  const [initialSession] = useState<SessionSnapshot | null>(() => readStoredSession());
  const adapterRef = useRef<MockLightningAdapter | null>(null);
  if (!adapterRef.current) adapterRef.current = new MockLightningAdapter(Object.values(initialSession?.mockInvoices ?? {}));
  const ledgerRef = useRef<LedgerEvent[]>(initialSession?.ledger ?? []);

  const [currency, setCurrency] = useState<Currency>(initialSession?.game?.currency ?? 'EUR');
  const [buyIn, setBuyIn] = useState(initialSession?.game?.buyInAmount ?? 20);
  const [chipValue, setChipValue] = useState(initialSession?.game?.chipValue ?? 1);
  const [btcFiatRate, setBtcFiatRate] = useState(initialSession?.game?.lockedBtcFiatRate ?? 100_000);
  const [dealerEnabled, setDealerEnabled] = useState(initialSession?.game?.dealer.enabled ?? false);
  const [dealerMode, setDealerMode] = useState<'FIXED' | 'PERCENT'>(initialSession?.game?.dealer.mode === 'FIXED' ? 'FIXED' : 'PERCENT');
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
  const [contributions, setContributions] = useState<Contribution[]>(initialSession?.contributions ?? []);
  const [invoices, setInvoices] = useState<Record<string, LightningInvoice>>(initialSession?.mockInvoices ?? {});
  const [stacks, setStacks] = useState<Record<string, number>>(initialSession?.stacks ?? {});
  const [stacksLocked, setStacksLocked] = useState(initialSession?.stacksLocked ?? false);
  const [settlement, setSettlement] = useState<SettlementResult | null>(initialSession?.settlement ?? null);
  const [payouts, setPayouts] = useState<Payout[]>(initialSession?.payouts ?? []);
  const [dealerPaid, setDealerPaid] = useState(initialSession?.dealerPaid ?? false);
  const [projectDonations, setProjectDonations] = useState<ProjectDonation[]>(initialSession?.projectDonations ?? []);
  const [donationSats, setDonationSats] = useState(1000);
  const [donorLabel, setDonorLabel] = useState('');
  const [ledger, setLedger] = useState<LedgerEvent[]>(initialSession?.ledger ?? []);
  const [ledgerVerified, setLedgerVerified] = useState(initialSession ? false : true);
  const [lastSavedAt, setLastSavedAt] = useState(initialSession?.savedAt ?? '');
  const [sessionRestored, setSessionRestored] = useState(Boolean(initialSession?.game));
  const [error, setError] = useState('');

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
    const snapshot: SessionSnapshot = {
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
    };
    saveSession(window.localStorage, snapshot);
    setLastSavedAt(savedAt);
  }, [game, players, contributions, invoices, stacks, stacksLocked, settlement, payouts, dealerPaid, ledger, projectDonations]);

  async function execute(action: () => void | Promise<void>) {
    try {
      setError('');
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

  async function startGame() {
    if (buyIn <= 0 || chipValue <= 0) throw new Error('La cave et la valeur du jeton doivent être positives');
    if (currency !== 'SATS' && btcFiatRate <= 0) throw new Error('Un taux BTC/fiat positif est requis pour les paiements Lightning');
    if (dealerEnabled && dealerValue < 0) throw new Error('La rémunération du dealer ne peut pas être négative');
    if (dealerEnabled && dealerMode === 'PERCENT' && dealerValue > 100) throw new Error('Le pourcentage dealer ne peut pas dépasser 100 %');
    if (dealerEnabled && dealerPayment === 'LIGHTNING' && !dealerLightningAddress.trim()) throw new Error('La destination Lightning du dealer est requise');
    if (startupDonationSats < 0 || !Number.isInteger(startupDonationSats)) throw new Error('Le don de démarrage doit être un nombre entier de sats');

    const createdAt = new Date().toISOString();
    const created: Game = {
      id: crypto.randomUUID(),
      currency,
      buyInAmount: buyIn,
      rebuyEnabled: true,
      rebuyAmount: buyIn,
      chipValue,
      status: 'OPEN',
      dealer: dealerEnabled ? {
        enabled: true,
        mode: dealerMode,
        value: dealerValue,
        label: dealerLabel.trim() || 'Dealer',
        preferredPayment: dealerPayment,
        lightningAddress: dealerLightningAddress.trim() || undefined,
      } : { enabled: false, mode: 'NONE' },
      lockedBtcFiatRate: currency === 'SATS' ? undefined : btcFiatRate,
      createdAt,
    };
    setGame(created);
    await record(created.id, 'GAME_CREATED', {
      currency: created.currency,
      buyInAmount: created.buyInAmount,
      chipValue: created.chipValue,
      lockedBtcFiatRate: created.lockedBtcFiatRate ?? null,
      dealer: created.dealer,
    });
    if (startupDonationSats > 0) await recordDonation(created.id, startupDonationSats, 'Organisateur');
  }

  async function addPlayer() {
    if (!game || game.status !== 'OPEN') throw new Error('La partie doit être ouverte');
    const cleanNickname = nickname.trim();
    if (!cleanNickname) throw new Error('Le pseudo est obligatoire');
    if (players.some((player) => player.nickname.toLocaleLowerCase() === cleanNickname.toLocaleLowerCase())) throw new Error('Ce pseudo est déjà utilisé');
    if (preferredPayment === 'LIGHTNING' && !lightningAddress.trim()) throw new Error('Une destination Lightning est requise pour un joueur Lightning');

    const player: Player = {
      id: crypto.randomUUID(),
      nickname: cleanNickname,
      preferredPayment,
      lightningAddress: lightningAddress.trim() || undefined,
    };
    setPlayers((current) => [...current, player]);
    setStacks((current) => ({ ...current, [player.id]: 0 }));
    setNickname('');
    setLightningAddress('');
    await record(game.id, 'PLAYER_JOINED', { playerId: player.id, nickname: player.nickname, preferredPayment: player.preferredPayment });
  }

  function hasPaidBuyIn(playerId: string): boolean {
    return contributions.some((contribution) => contribution.playerId === playerId && contribution.kind === 'BUYIN' && contribution.status === 'PAID');
  }

  function hasOpenBuyIn(playerId: string): boolean {
    return contributions.some((contribution) => contribution.playerId === playerId && contribution.kind === 'BUYIN' && contribution.status !== 'CANCELLED');
  }

  async function addCashContribution(player: Player, kind: ContributionKind) {
    if (!game) throw new Error('Aucune partie');
    await assertLedgerIntegrity();
    if (kind === 'BUYIN' && hasOpenBuyIn(player.id)) throw new Error('Une cave existe déjà pour ce joueur');
    if (kind === 'REBUY' && !hasPaidBuyIn(player.id)) throw new Error('La cave initiale doit être encaissée avant un rebuy');

    const contribution = createContribution(game, player.id, kind, 'CASH');
    const created = [...contributions, contribution];
    const paid = confirmCashContribution(created, contribution.id);
    setContributions(paid);
    await record(game.id, kind === 'BUYIN' ? 'BUYIN_CREATED' : 'REBUY_CREATED', { contributionId: contribution.id, playerId: player.id, method: 'CASH', amount: contribution.amount });
    await record(game.id, 'CASH_CONFIRMED', { contributionId: contribution.id, playerId: player.id, amount: contribution.amount });
    await record(game.id, 'CONTRIBUTION_PAID', { contributionId: contribution.id, playerId: player.id, method: 'CASH' });
  }

  async function addLightningContribution(player: Player, kind: ContributionKind) {
    if (!game) throw new Error('Aucune partie');
    await assertLedgerIntegrity();
    if (kind === 'BUYIN' && hasOpenBuyIn(player.id)) throw new Error('Une cave existe déjà pour ce joueur');
    if (kind === 'REBUY' && !hasPaidBuyIn(player.id)) throw new Error('La cave initiale doit être encaissée avant un rebuy');

    const contribution = createContribution(game, player.id, kind, 'LIGHTNING');
    const sats = toSats(contribution.amount, game);
    if (sats <= 0) throw new Error('Le montant converti en sats est trop faible');
    const invoice = await adapterRef.current!.createInvoice(sats, `NOIOU ${kind.toLowerCase()} ${player.nickname}`);
    const pending = markContributionPending([...contributions, contribution], contribution.id, invoice.id);
    setContributions(pending);
    setInvoices((current) => ({ ...current, [contribution.id]: invoice }));
    await record(game.id, kind === 'BUYIN' ? 'BUYIN_CREATED' : 'REBUY_CREATED', { contributionId: contribution.id, playerId: player.id, method: 'LIGHTNING', amount: contribution.amount, sats });
    await record(game.id, 'LIGHTNING_INVOICE_CREATED', { contributionId: contribution.id, invoiceId: invoice.id, sats });
  }

  async function simulateInvoicePaid(contributionId: string) {
    if (!game) throw new Error('Aucune partie');
    await assertLedgerIntegrity();
    const contribution = contributions.find((item) => item.id === contributionId);
    if (!contribution?.externalReference) throw new Error('Invoice introuvable');
    adapterRef.current!.markInvoicePaid(contribution.externalReference);
    const status = await adapterRef.current!.getInvoiceStatus(contribution.externalReference);
    if (status !== 'PAID') throw new Error('Invoice non payée');
    setContributions((current) => confirmLightningContribution(current, contributionId, contribution.externalReference!));
    setInvoices((current) => ({ ...current, [contributionId]: { ...current[contributionId], status: 'PAID' } }));
    await record(game.id, 'CONTRIBUTION_PAID', { contributionId, playerId: contribution.playerId, method: 'LIGHTNING', invoiceId: contribution.externalReference });
  }

  async function beginSettlement() {
    if (!game || game.status !== 'OPEN') throw new Error('La partie n’est pas ouverte');
    await assertLedgerIntegrity();
    if (players.length === 0) throw new Error('Ajoute au moins un joueur');
    if (contributions.some((contribution) => contribution.status === 'CREATED' || contribution.status === 'PENDING')) throw new Error('Une cave ou un rebuy est encore en attente');
    if (!contributions.some((contribution) => contribution.status === 'PAID')) throw new Error('Aucune cave encaissée');
    const next = { ...game, status: 'SETTLING' as const };
    setGame(next);
    await record(game.id, 'SETTLEMENT_STARTED', { paidContributions: contributions.filter((contribution) => contribution.status === 'PAID').length });
  }

  async function validateStacks() {
    if (!game || game.status !== 'SETTLING') throw new Error('La partie doit être en règlement');
    await assertLedgerIntegrity();
    const finalStacks: FinalStack[] = players.map((player) => ({ playerId: player.id, chips: stacks[player.id] ?? 0 }));
    const result = calculateSettlement(game, players, contributions, finalStacks);
    setSettlement(result);
    if (!result.balanced) return;
    setStacksLocked(true);
    setPayouts(result.payouts);
    await record(game.id, 'FINAL_STACKS_RECORDED', { stacks: finalStacks });
    await record(game.id, 'SETTLEMENT_CALCULATED', {
      issuedChips: result.issuedChips,
      countedChips: result.countedChips,
      distributableAmount: result.distributableAmount,
      dealerCompensation: result.dealerCompensation,
    });
  }

  async function confirmPlayerPayout(payout: Payout) {
    if (!game || !settlement?.balanced) throw new Error('Le règlement n’est pas prêt');
    await assertLedgerIntegrity();
    if (payout.status === 'CONFIRMED') return;
    const player = players.find((candidate) => candidate.id === payout.playerId);
    if (!player) throw new Error('Joueur introuvable');

    if (payout.method === 'LIGHTNING') {
      if (!player.lightningAddress) throw new Error(`Destination Lightning manquante pour ${player.nickname}`);
      const sats = toSats(payout.amount, game);
      if (sats <= 0) throw new Error('Le paiement Lightning converti vaut 0 sat');
      const prepared = await adapterRef.current!.preparePayment(player.lightningAddress, sats);
      await adapterRef.current!.confirmPreparedPayment(prepared.id);
    }

    setPayouts((current) => confirmPayout(current, payout.playerId));
    await record(game.id, 'PAYOUT_CONFIRMED', { playerId: payout.playerId, method: payout.method, amount: payout.amount, mock: payout.method === 'LIGHTNING' });
  }

  async function confirmDealerCompensation() {
    if (!game || !settlement || settlement.dealerCompensation <= 0) return;
    await assertLedgerIntegrity();
    if (dealerPaid) return;
    const method = game.dealer.preferredPayment ?? 'CASH';
    if (method === 'LIGHTNING') {
      if (!game.dealer.lightningAddress) throw new Error('Destination Lightning du dealer manquante');
      const sats = toSats(settlement.dealerCompensation, game);
      if (sats <= 0) throw new Error('La rémunération Lightning du dealer vaut 0 sat');
      const prepared = await adapterRef.current!.preparePayment(game.dealer.lightningAddress, sats);
      await adapterRef.current!.confirmPreparedPayment(prepared.id);
    }
    setDealerPaid(true);
    await record(game.id, 'DEALER_COMPENSATION_CONFIRMED', { amount: settlement.dealerCompensation, method, mock: method === 'LIGHTNING' });
  }

  async function closeGame() {
    if (!game || !settlement) throw new Error('Le règlement n’est pas prêt');
    await assertLedgerIntegrity();
    const closure = checkGameClosure(settlement, payouts, dealerPaid);
    if (!closure.allowed) throw new Error(closure.reasons.join(' · '));
    setGame({ ...game, status: 'CLOSED' });
    await record(game.id, 'GAME_CLOSED', { payouts: payouts.filter((payout) => payout.amount > 0).length, ledgerEvents: ledgerRef.current.length + 1 });
  }

  async function addEndDonation() {
    if (!game || game.status !== 'CLOSED') throw new Error('Les dons de fin sont proposés après clôture');
    await assertLedgerIntegrity();
    await recordDonation(game.id, donationSats, donorLabel);
    setDonorLabel('');
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
    setProjectDonations([]);
    setLedger(emptyLedger);
    setLedgerVerified(true);
    setSessionRestored(false);
    setError('');
    setStartupDonationSats(0);
    setDonorLabel('');
  }

  const paidTotal = contributions.filter((contribution) => contribution.status === 'PAID').reduce((sum, contribution) => sum + contribution.amount, 0);
  const closure = checkGameClosure(settlement, payouts, dealerPaid);
  const totalDonations = projectDonations.reduce((sum, donation) => sum + donation.sats, 0);

  return (
    <main className="shell">
      <header>
        <div>
          <p className="eyebrow">Private prototype</p>
          <h1>NOIOU</h1>
          <p className="tagline">La partie reste physique. NOIOU s’occupe seulement de la caisse et du règlement.</p>
        </div>
        <span className="badge">Non-custodial by design</span>
      </header>

      {sessionRestored && <div className="session-note"><span>Session locale restaurée · aucun secret wallet n’est stocké.</span><button onClick={() => setSessionRestored(false)}>OK</button></div>}
      {game && <div className="save-note">Sauvegarde locale automatique {lastSavedAt ? `· ${new Date(lastSavedAt).toLocaleTimeString('fr-FR')}` : ''}</div>}
      {error && <div className="alert" role="alert">{error}</div>}

      {!game && (
        <section className="card">
          <div className="section-title"><h2>Créer la partie</h2><span>aucun fonds réel</span></div>
          <div className="grid">
            <label>Devise
              <select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}>
                <option value="EUR">EUR</option><option value="USD">USD</option><option value="SATS">SATS</option>
              </select>
            </label>
            <label>Cave / rebuy
              <input type="number" min="1" step={currency === 'SATS' ? 1 : 0.01} value={buyIn} onChange={(event) => setBuyIn(Number(event.target.value))} />
            </label>
            <label>Valeur d’un jeton
              <input type="number" min="0.01" step={currency === 'SATS' ? 1 : 0.01} value={chipValue} onChange={(event) => setChipValue(Number(event.target.value))} />
            </label>
            {currency !== 'SATS' && <label>Taux BTC/{currency} verrouillé (prototype)
              <input type="number" min="1" value={btcFiatRate} onChange={(event) => setBtcFiatRate(Number(event.target.value))} />
            </label>}
            <label className="check"><input type="checkbox" checked={dealerEnabled} onChange={(event) => setDealerEnabled(event.target.checked)} /> Dealer présent</label>
            {dealerEnabled && <>
              <label>Nom du dealer<input value={dealerLabel} onChange={(event) => setDealerLabel(event.target.value)} /></label>
              <label>Mode dealer
                <select value={dealerMode} onChange={(event) => setDealerMode(event.target.value as 'FIXED' | 'PERCENT')}>
                  <option value="PERCENT">Pourcentage du pot</option>
                  <option value="FIXED">Montant fixe</option>
                </select>
              </label>
              <label>{dealerMode === 'PERCENT' ? 'Dealer (%)' : `Dealer (${currency})`}
                <input type="number" min="0" max={dealerMode === 'PERCENT' ? 100 : undefined} value={dealerValue} onChange={(event) => setDealerValue(Number(event.target.value))} />
              </label>
              <label>Règlement dealer
                <select value={dealerPayment} onChange={(event) => setDealerPayment(event.target.value as PaymentMethod)}>
                  <option value="CASH">Espèces</option><option value="LIGHTNING">Lightning</option>
                </select>
              </label>
              {dealerPayment === 'LIGHTNING' && <label>Lightning Address dealer<input value={dealerLightningAddress} onChange={(event) => setDealerLightningAddress(event.target.value)} placeholder="dealer@wallet.example" /></label>}
            </>}
          </div>
          <div className="donation-options">
            <strong>❤️ Soutenir NOIOU au lancement (mock, hors cagnotte)</strong>
            <div className="actions">{[0, 500, 1000, 5000].map((sats) => <button className={startupDonationSats === sats ? 'selected' : ''} key={sats} onClick={() => setStartupDonationSats(sats)}>{sats === 0 ? 'Pas maintenant' : `${sats.toLocaleString('fr-FR')} sats`}</button>)}</div>
          </div>
          <button className="primary" onClick={() => void execute(startGame)}>Démarrer la partie</button>
        </section>
      )}

      {game && (
        <section className="card status-card">
          <div><strong>Partie {game.status}</strong><small>{game.currency} · cave {formatAmount(game.buyInAmount, game.currency)}</small></div>
          <div><strong>{formatAmount(paidTotal, game.currency)}</strong><small>encaissés dans la partie</small></div>
        </section>
      )}

      {game?.status === 'OPEN' && (
        <>
          <section className="card">
            <div className="section-title"><h2>Ajouter un joueur</h2><span>{players.length} joueurs</span></div>
            <div className="grid player-form">
              <label>Pseudo<input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Alice" /></label>
              <label>Règlement préféré
                <select value={preferredPayment} onChange={(event) => setPreferredPayment(event.target.value as PaymentMethod | 'ANY')}>
                  <option value="CASH">Espèces</option><option value="LIGHTNING">Lightning</option><option value="ANY">Indifférent</option>
                </select>
              </label>
              {(preferredPayment === 'LIGHTNING' || preferredPayment === 'ANY') && <label>Lightning Address (facultatif si ANY)<input value={lightningAddress} onChange={(event) => setLightningAddress(event.target.value)} placeholder="alice@wallet.example" /></label>}
            </div>
            <button onClick={() => void execute(addPlayer)}>Ajouter</button>
          </section>

          <section className="card">
            <div className="section-title"><h2>Caves et rebuys</h2><span>jetons seulement après encaissement</span></div>
            {players.length === 0 && <p className="muted">Ajoute les joueurs pour commencer.</p>}
            {players.map((player) => {
              const playerContributions = contributions.filter((contribution) => contribution.playerId === player.id);
              const buyInPaid = hasPaidBuyIn(player.id);
              return (
                <div className="player-box" key={player.id}>
                  <div className="player-heading"><div><strong>{player.nickname}</strong><small>{player.preferredPayment}</small></div><span>{playerContributions.filter((item) => item.status === 'PAID').length} encaissé(s)</span></div>
                  {!buyInPaid && !hasOpenBuyIn(player.id) && <div className="actions"><button onClick={() => void execute(() => addCashContribution(player, 'BUYIN'))}>Cave espèces reçues</button><button onClick={() => void execute(() => addLightningContribution(player, 'BUYIN'))}>Cave Lightning mock</button></div>}
                  {playerContributions.map((contribution) => {
                    const invoice = invoices[contribution.id];
                    return <div className="contribution" key={contribution.id}><span>{contribution.kind} · {contribution.method}</span><strong>{formatAmount(contribution.amount, game.currency)}</strong><em className={`state ${contribution.status.toLowerCase()}`}>{contribution.status}</em>{invoice && contribution.status === 'PENDING' && <><code>{invoice.request}</code><button onClick={() => void execute(() => simulateInvoicePaid(contribution.id))}>Simuler paiement Lightning</button></>}</div>;
                  })}
                  {buyInPaid && <div className="actions"><button onClick={() => void execute(() => addCashContribution(player, 'REBUY'))}>+ Rebuy espèces</button><button onClick={() => void execute(() => addLightningContribution(player, 'REBUY'))}>+ Rebuy Lightning mock</button></div>}
                </div>
              );
            })}
            {players.length > 0 && <button className="primary" onClick={() => void execute(beginSettlement)}>Terminer la partie et compter les jetons</button>}
          </section>
        </>
      )}

      {(game?.status === 'SETTLING' || game?.status === 'CLOSED') && (
        <>
          <section className="card">
            <div className="section-title"><h2>Stacks finaux</h2><span>{stacksLocked ? 'verrouillés' : 'à compter'}</span></div>
            {players.map((player) => <div className="row" key={player.id}><div><strong>{player.nickname}</strong><small>{player.preferredPayment}</small></div><input aria-label={`Stack ${player.nickname}`} type="number" min="0" step="1" disabled={stacksLocked || game.status === 'CLOSED'} value={stacks[player.id] ?? 0} onChange={(event) => setStacks((current) => ({ ...current, [player.id]: Number(event.target.value) }))} /></div>)}
            {!stacksLocked && game.status === 'SETTLING' && <button className="primary" onClick={() => void execute(validateStacks)}>Valider le comptage</button>}
          </section>

          {settlement && <section className={`card ${settlement.balanced ? 'ok' : 'blocked'}`}>
            <div className="section-title"><h2>Contrôle de conservation</h2><strong>{settlement.balanced ? 'ÉQUILIBRÉ ✓' : 'RÈGLEMENT BLOQUÉ'}</strong></div>
            <p>Jetons émis : {settlement.issuedChips} · comptés : {settlement.countedChips}</p>
            {!settlement.balanced && <p>Écart : {settlement.chipDifference > 0 ? '+' : ''}{settlement.chipDifference} jetons. Le comptage reste modifiable.</p>}
            {settlement.balanced && <p>Joueurs : {formatAmount(settlement.distributableAmount, game.currency)} · dealer : {formatAmount(settlement.dealerCompensation, game.currency)}</p>}
          </section>}

          {settlement?.balanced && <section className="card">
            <div className="section-title"><h2>Règlements</h2><span>Lightning = mock en V1 privée</span></div>
            <div className="payouts">{payouts.filter((payout) => payout.amount > 0).map((payout) => {
              const player = players.find((candidate) => candidate.id === payout.playerId)!;
              return <div className="payout" key={payout.playerId}><span>{player.nickname}</span><strong>{formatAmount(payout.amount, game.currency)}</strong><small>{payout.method} · {payout.status}</small>{game.status !== 'CLOSED' && payout.status !== 'CONFIRMED' && <button onClick={() => void execute(() => confirmPlayerPayout(payout))}>{payout.method === 'LIGHTNING' ? 'Confirmer paiement mock' : 'Confirmer remise espèces'}</button>}</div>;
            })}</div>
            {settlement.dealerCompensation > 0 && <div className="dealer-line"><span>{game.dealer.label ?? 'Dealer'} · {game.dealer.preferredPayment ?? 'CASH'}</span><strong>{formatAmount(settlement.dealerCompensation, game.currency)}</strong><button disabled={dealerPaid || game.status === 'CLOSED'} onClick={() => void execute(confirmDealerCompensation)}>{dealerPaid ? 'Confirmé ✓' : (game.dealer.preferredPayment === 'LIGHTNING' ? 'Confirmer paiement mock' : 'Confirmer rémunération')}</button></div>}
            {game.status === 'SETTLING' && <><div className={`closure ${closure.allowed ? 'ready' : ''}`}>{closure.allowed ? 'Tous les règlements sont confirmés.' : closure.reasons.join(' · ')}</div><button className="primary" disabled={!closure.allowed} onClick={() => void execute(closeGame)}>Clôturer la partie</button></>}
            {game.status === 'CLOSED' && <div className="success">Partie clôturée : aucun règlement restant.</div>}
          </section>}
        </>
      )}

      <section className="card ledger-card">
        <div className="section-title"><h2>Journal d’audit</h2><strong>{ledgerVerified ? 'CHAÎNE VALIDE ✓' : 'ALTÉRATION DÉTECTÉE'}</strong></div>
        <p>{ledger.length} événement(s) append-only · SHA-256 chaîné.</p>
        {ledger.slice(-5).reverse().map((event) => <div className="ledger-event" key={event.id}><span>#{event.sequence} {event.type}</span><code>{event.hash.slice(0, 12)}…</code></div>)}
      </section>

      <section className="card donation">
        <div><h2>Soutenir NOIOU</h2><p>Dons volontaires, en sats, toujours hors cagnotte. Prototype : aucune transaction réelle.</p><small>{projectDonations.length} don(s) mock · {totalDonations.toLocaleString('fr-FR')} sats au total</small></div>
        {game?.status === 'CLOSED' ? <div className="donation-form"><label>Donateur (pseudo facultatif)<input value={donorLabel} onChange={(event) => setDonorLabel(event.target.value)} placeholder="Alice" /></label><label>Sats<input type="number" min="1" step="1" value={donationSats} onChange={(event) => setDonationSats(Number(event.target.value))} /></label><div className="actions">{[500, 1000, 5000].map((sats) => <button key={sats} onClick={() => setDonationSats(sats)}>{sats.toLocaleString('fr-FR')}</button>)}</div><button onClick={() => void execute(addEndDonation)}>⚡ Simuler le don</button></div> : <span className="muted">Un autre don pourra être proposé après clôture.</span>}
      </section>

      {game?.status === 'CLOSED' && <section className="card"><div className="section-title"><h2>Nouvelle soirée</h2><span>la partie actuelle est terminée</span></div><p className="muted">La session locale actuelle sera effacée du navigateur. Le code et les données GitHub ne sont pas concernés.</p><button onClick={resetSession}>Effacer cette session locale et créer une nouvelle partie</button></section>}
    </main>
  );
}
