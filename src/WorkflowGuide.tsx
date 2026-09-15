import type { Contribution, Game, Payout, Player, SettlementResult } from './domain';
import { isPlayStarted, lobbyReadiness, MIN_POKER_PLAYERS } from './lobby';
import './workflowGuide.css';

interface Props {
  game: Game;
  players: Player[];
  contributions: Contribution[];
  settlement: SettlementResult | null;
  payouts: Payout[];
  dealerPaid: boolean;
  onStartGame?: () => void;
}

function formatAmount(amount: number, game: Game): string {
  if (game.currency === 'SATS') return `${Math.round(amount).toLocaleString('fr-FR')} sats`;
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: game.currency }).format(amount);
}

function goTo(id: string) {
  if (typeof document === 'undefined') return;
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function Guide({ children, ready = false }: { children: React.ReactNode; ready?: boolean }) {
  return <aside id="workflow-guide" className={`workflow-guide${ready ? ' ready' : ''}`} aria-live="polite">{children}</aside>;
}

export default function WorkflowGuide({ game, players, contributions, settlement, payouts, dealerPaid, onStartGame }: Props) {
  const paidBuyIns = players.filter((player) => contributions.some((item) => item.playerId === player.id && item.kind === 'BUYIN' && item.status === 'PAID'));
  const pendingContribution = contributions.find((item) => item.status === 'CREATED' || item.status === 'PENDING');
  const pendingContributionPlayer = pendingContribution ? players.find((player) => player.id === pendingContribution.playerId) : undefined;
  const nextUnpaid = players.find((player) => !paidBuyIns.some((paid) => paid.id === player.id));
  const pendingPayout = payouts.find((payout) => payout.amount > 0 && payout.status !== 'CONFIRMED');
  const pendingPayoutPlayer = pendingPayout ? players.find((player) => player.id === pendingPayout.playerId) : undefined;

  if (game.status === 'OPEN' && !isPlayStarted(game)) {
    const readiness = lobbyReadiness(players, contributions);

    if (players.length < MIN_POKER_PLAYERS) return <Guide>
      <div>
        <small>Préparation · {players.length}/{MIN_POKER_PLAYERS} joueurs minimum</small>
        <strong>{players.length === 0 ? 'Ajoute le premier joueur' : 'Ajoute au moins un deuxième joueur'}</strong>
        <span>La partie ne peut pas démarrer avec un seul joueur. Les caves déjà préparées restent enregistrées.</span>
      </div>
      <button onClick={() => goTo('add-player')}>Ajouter un joueur</button>
    </Guide>;

    if (pendingContribution && pendingContributionPlayer) return <Guide>
      <div><small>Préparation · paiement en attente</small><strong>Finaliser {pendingContributionPlayer.nickname} · {formatAmount(pendingContribution.amount, game)}</strong><span>{pendingContribution.method === 'LIGHTNING' ? 'Présente la demande exacte, puis confirme uniquement après le paiement.' : 'Confirme uniquement après réception réelle des espèces.'}</span></div>
      <button onClick={() => goTo(`player-${pendingContributionPlayer.id}`)}>Revenir à {pendingContributionPlayer.nickname}</button>
    </Guide>;

    if (nextUnpaid) return <Guide>
      <div><small>Préparation · caves {paidBuyIns.length}/{players.length}</small><strong>Encaisser {nextUnpaid.nickname} · {formatAmount(game.buyInAmount, game)}</strong><span>Toutes les caves initiales doivent être comptabilisées avant de démarrer la partie.</span></div>
      <button onClick={() => goTo(`player-${nextUnpaid.id}`)}>Encaisser {nextUnpaid.nickname}</button>
    </Guide>;

    if (readiness.canStart) return <Guide ready>
      <div><small>Préparation terminée</small><strong>✓ {players.length} joueurs prêts</strong><span>Toutes les caves initiales sont encaissées. Le poker peut maintenant commencer.</span></div>
      <button onClick={onStartGame}>Démarrer la partie</button>
    </Guide>;
  }

  if (game.status === 'OPEN') {
    if (pendingContribution && pendingContributionPlayer) return <Guide>
      <div><small>Paiement en attente</small><strong>Finaliser {pendingContributionPlayer.nickname} · {formatAmount(pendingContribution.amount, game)}</strong><span>{pendingContribution.method === 'LIGHTNING' ? 'Présente le QR exact, puis confirme uniquement après le paiement.' : 'Confirme uniquement après réception réelle des espèces.'}</span></div>
      <button onClick={() => goTo(`player-${pendingContributionPlayer.id}`)}>Revenir à {pendingContributionPlayer.nickname}</button>
    </Guide>;

    if (nextUnpaid) return <Guide>
      <div><small>Caves · {paidBuyIns.length}/{players.length} reçues</small><strong>Encaisser {nextUnpaid.nickname} · {formatAmount(game.buyInAmount, game)}</strong><span>Ce joueur a rejoint après le démarrage et doit encore régler sa cave initiale.</span></div>
      <button onClick={() => goTo(`player-${nextUnpaid.id}`)}>Continuer avec {nextUnpaid.nickname}</button>
    </Guide>;

    return <Guide ready>
      <div><small>Partie en cours</small><strong>✓ Toutes les caves sont encaissées</strong><span>Les rebuys restent possibles. À la fin de la vraie partie, passe au comptage des jetons physiques.</span></div>
      <button onClick={() => goTo('collections')}>Terminer et compter</button>
    </Guide>;
  }

  if (game.status === 'SETTLING' && !settlement?.balanced) return <Guide>
    <div><small>Comptage</small><strong>Compte les jetons de chaque joueur</strong><span>NOIOU compare uniquement des jetons à des jetons ; les sats ne déterminent plus leur nombre.</span></div>
    <button onClick={() => goTo('final-stacks')}>Aller au comptage</button>
  </Guide>;

  if (game.status === 'SETTLING' && pendingPayout && pendingPayoutPlayer) return <Guide>
    <div><small>Règlement</small><strong>Régler {pendingPayoutPlayer.nickname} · {formatAmount(pendingPayout.amount, game)}</strong><span>Pour Lightning, NOIOU exige une demande du montant exact avant confirmation.</span></div>
    <button onClick={() => goTo(`payout-${pendingPayoutPlayer.id}`)}>Régler {pendingPayoutPlayer.nickname}</button>
  </Guide>;

  if (game.status === 'SETTLING' && settlement?.dealerCompensation && !dealerPaid) return <Guide>
    <div><small>Règlement</small><strong>Régler {game.dealer.label ?? 'le dealer'} · {formatAmount(settlement.dealerCompensation, game)}</strong><span>Cette rémunération est séparée des tips volontaires.</span></div>
    <button onClick={() => goTo('dealer-settlement')}>Régler le dealer</button>
  </Guide>;

  if (game.status === 'SETTLING') return <Guide ready>
    <div><small>Règlement</small><strong>✓ Tous les règlements sont confirmés</strong><span>Tu peux clôturer la partie.</span></div>
    <button onClick={() => goTo('settlements')}>Clôturer</button>
  </Guide>;

  return <Guide ready>
    <div><small>Partie terminée</small><strong>✓ Comptes clôturés</strong><span>Les dons et tips éventuels restent hors cagnotte.</span></div>
  </Guide>;
}
