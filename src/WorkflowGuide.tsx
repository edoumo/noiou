import type { Contribution, Game, Payout, Player, SettlementResult } from './domain';
import { useI18n } from './i18n/provider';
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

function goTo(id: string) {
  if (typeof document === 'undefined') return;
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function Guide({ children, ready = false, startAction = false }: { children: React.ReactNode; ready?: boolean; startAction?: boolean }) {
  return <aside id="workflow-guide" className={`workflow-guide${ready ? ' ready' : ''}${startAction ? ' start-game-action' : ''}`} aria-live="polite">{children}</aside>;
}

export default function WorkflowGuide({ game, players, contributions, settlement, payouts, dealerPaid, onStartGame }: Props) {
  const { t, formatAmount } = useI18n();
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
        <small>{t('guide.prepare.minimum', { count: players.length, minimum: MIN_POKER_PLAYERS })}</small>
        <strong>{players.length === 0 ? t('guide.prepare.addFirst') : t('guide.prepare.addSecond')}</strong>
        <span>{t('guide.prepare.addNote')}</span>
      </div>
      <button onClick={() => goTo('add-player')}>{t('player.add')}</button>
    </Guide>;

    if (pendingContribution && pendingContributionPlayer) return <Guide>
      <div><small>{t('guide.prepare.pendingPayment')}</small><strong>{t('guide.finalizePlayer', { player: pendingContributionPlayer.nickname, amount: formatAmount(pendingContribution.amount, game.currency) })}</strong><span>{pendingContribution.method === 'LIGHTNING' ? t('guide.presentExactThenConfirm') : t('guide.confirmAfterCash')}</span></div>
      <button onClick={() => goTo(`player-${pendingContributionPlayer.id}`)}>{t('guide.backToPlayer', { player: pendingContributionPlayer.nickname })}</button>
    </Guide>;

    if (nextUnpaid) return <Guide>
      <div><small>{t('guide.prepare.caves', { paid: paidBuyIns.length, total: players.length })}</small><strong>{t('guide.collectPlayer', { player: nextUnpaid.nickname, amount: formatAmount(game.buyInAmount, game.currency) })}</strong><span>{t('guide.collectNote')}</span></div>
      <button onClick={() => goTo(`player-${nextUnpaid.id}`)}>{t('guide.collectPlayerButton', { player: nextUnpaid.nickname })}</button>
    </Guide>;

    if (readiness.canStart) return <Guide ready startAction>
      <div><small>{t('guide.prepare.done')}</small><strong>{t('guide.playersReady', { count: players.length })}</strong><span>{t('guide.canStartNote')}</span></div>
      <button onClick={onStartGame}>{t('guide.startGame')}</button>
    </Guide>;
  }

  if (game.status === 'OPEN') {
    if (pendingContribution && pendingContributionPlayer) return <Guide>
      <div><small>{t('guide.pendingPayment')}</small><strong>{t('guide.finalizePlayer', { player: pendingContributionPlayer.nickname, amount: formatAmount(pendingContribution.amount, game.currency) })}</strong><span>{pendingContribution.method === 'LIGHTNING' ? t('guide.presentQrThenConfirm') : t('guide.confirmAfterCash')}</span></div>
      <button onClick={() => goTo(`player-${pendingContributionPlayer.id}`)}>{t('guide.backToPlayer', { player: pendingContributionPlayer.nickname })}</button>
    </Guide>;

    if (nextUnpaid) return <Guide>
      <div><small>{t('guide.caves.received', { paid: paidBuyIns.length, total: players.length })}</small><strong>{t('guide.collectPlayer', { player: nextUnpaid.nickname, amount: formatAmount(game.buyInAmount, game.currency) })}</strong><span>{t('guide.joinedLate')}</span></div>
      <button onClick={() => goTo(`player-${nextUnpaid.id}`)}>{t('guide.continueWith', { player: nextUnpaid.nickname })}</button>
    </Guide>;

    return <Guide ready>
      <div><small>{t('guide.playing')}</small><strong>{t('guide.allCavesCollected')}</strong><span>{t('guide.rebuysPossible')}</span></div>
      <button onClick={() => goTo('collections')}>{t('guide.finishAndCount')}</button>
    </Guide>;
  }

  if (game.status === 'SETTLING' && !settlement?.balanced) return <Guide>
    <div><small>{t('guide.counting')}</small><strong>{t('guide.countEach')}</strong><span>{t('guide.countNote')}</span></div>
    <button onClick={() => goTo('final-stacks')}>{t('guide.goToCounting')}</button>
  </Guide>;

  if (game.status === 'SETTLING' && pendingPayout && pendingPayoutPlayer) return <Guide>
    <div><small>{t('settlement.title')}</small><strong>{t('guide.settlePlayer', { player: pendingPayoutPlayer.nickname, amount: formatAmount(pendingPayout.amount, game.currency) })}</strong><span>{t('guide.settleNote')}</span></div>
    <button onClick={() => goTo(`payout-${pendingPayoutPlayer.id}`)}>{t('guide.settlePlayerButton', { player: pendingPayoutPlayer.nickname })}</button>
  </Guide>;

  if (game.status === 'SETTLING' && settlement?.dealerCompensation && !dealerPaid) return <Guide>
    <div><small>{t('settlement.title')}</small><strong>{t('guide.settleDealer', { dealer: game.dealer.label ?? t('guide.dealerFallback'), amount: formatAmount(settlement.dealerCompensation, game.currency) })}</strong><span>{t('guide.dealerNote')}</span></div>
    <button onClick={() => goTo('dealer-settlement')}>{t('guide.settleDealerButton')}</button>
  </Guide>;

  if (game.status === 'SETTLING') return <Guide ready>
    <div><small>{t('settlement.title')}</small><strong>{t('guide.allSettled')}</strong><span>{t('guide.canClose')}</span></div>
    <button onClick={() => goTo('settlements')}>{t('guide.close')}</button>
  </Guide>;

  return <Guide ready>
    <div><small>{t('guide.finished')}</small><strong>{t('guide.accountsClosed')}</strong><span>{t('guide.donationsOutside')}</span></div>
  </Guide>;
}
