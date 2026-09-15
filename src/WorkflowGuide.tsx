import type { Contribution, Game, Payout, Player, SettlementResult } from './domain';
import './workflowGuide.css';

interface Props {
  game: Game;
  players: Player[];
  contributions: Contribution[];
  settlement: SettlementResult | null;
  payouts: Payout[];
  dealerPaid: boolean;
}

function formatAmount(amount: number, game: Game): string {
  if (game.currency === 'SATS') return `${Math.round(amount).toLocaleString('fr-FR')} sats`;
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: game.currency }).format(amount);
}

function goTo(id: string) {
  if (typeof document === 'undefined') return;
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function WorkflowGuide({ game, players, contributions, settlement, payouts, dealerPaid }: Props) {
  const paidBuyIns = players.filter((player) => contributions.some((item) => item.playerId === player.id && item.kind === 'BUYIN' && item.status === 'PAID'));
  const nextUnpaid = players.find((player) => !paidBuyIns.some((paid) => paid.id === player.id));
  const pendingPayout = payouts.find((payout) => payout.amount > 0 && payout.status !== 'CONFIRMED');
  const pendingPayoutPlayer = pendingPayout ? players.find((player) => player.id === pendingPayout.playerId) : undefined;

  if (game.status === 'OPEN') {
    if (players.length === 0) return <aside className="workflow-guide" aria-live="polite">
      <div><small>Prochaine action</small><strong>Ajoute le premier joueur</strong><span>NOIOU te guidera ensuite cave par cave.</span></div>
      <button onClick={() => goTo('add-player')}>Ajouter un joueur</button>
    </aside>;

    if (nextUnpaid) return <aside className="workflow-guide" aria-live="polite">
      <div><small>Caves · {paidBuyIns.length}/{players.length} reçues</small><strong>Encaisser {nextUnpaid.nickname} · {formatAmount(game.buyInAmount, game)}</strong><span>Un QR Lightning exact sera préparé avant confirmation, ou une confirmation espèces sera demandée.</span></div>
      <button onClick={() => goTo(`player-${nextUnpaid.id}`)}>Continuer avec {nextUnpaid.nickname}</button>
    </aside>;

    return <aside className="workflow-guide ready" aria-live="polite">
      <div><small>Caves · {paidBuyIns.length}/{players.length} reçues</small><strong>✓ Toutes les caves sont encaissées</strong><span>La partie peut se jouer. À la fin, passe au comptage des jetons physiques.</span></div>
      <button onClick={() => goTo('collections')}>Terminer et compter</button>
    </aside>;
  }

  if (game.status === 'SETTLING' && !settlement?.balanced) return <aside className="workflow-guide" aria-live="polite">
    <div><small>Comptage</small><strong>Compte les jetons de chaque joueur</strong><span>NOIOU compare uniquement des jetons à des jetons ; les sats ne déterminent plus leur nombre.</span></div>
    <button onClick={() => goTo('final-stacks')}>Aller au comptage</button>
  </aside>;

  if (game.status === 'SETTLING' && pendingPayout && pendingPayoutPlayer) return <aside className="workflow-guide" aria-live="polite">
    <div><small>Règlement</small><strong>Régler {pendingPayoutPlayer.nickname} · {formatAmount(pendingPayout.amount, game)}</strong><span>Pour Lightning, NOIOU exige une demande du montant exact avant confirmation.</span></div>
    <button onClick={() => goTo(`payout-${pendingPayoutPlayer.id}`)}>Régler {pendingPayoutPlayer.nickname}</button>
  </aside>;

  if (game.status === 'SETTLING' && settlement?.dealerCompensation && !dealerPaid) return <aside className="workflow-guide" aria-live="polite">
    <div><small>Règlement</small><strong>Régler {game.dealer.label ?? 'le dealer'} · {formatAmount(settlement.dealerCompensation, game)}</strong><span>Cette rémunération est séparée des tips volontaires.</span></div>
    <button onClick={() => goTo('dealer-settlement')}>Régler le dealer</button>
  </aside>;

  if (game.status === 'SETTLING') return <aside className="workflow-guide ready" aria-live="polite">
    <div><small>Règlement</small><strong>✓ Tous les règlements sont confirmés</strong><span>Tu peux clôturer la partie.</span></div>
    <button onClick={() => goTo('settlements')}>Clôturer</button>
  </aside>;

  return <aside className="workflow-guide ready" aria-live="polite">
    <div><small>Partie terminée</small><strong>✓ Comptes clôturés</strong><span>Les dons et tips éventuels restent hors cagnotte.</span></div>
  </aside>;
}
