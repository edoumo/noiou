import { useMemo, useState } from 'react';
import type { Contribution, Currency, FinalStack, Game, Player } from './domain';
import { calculateSettlement } from './settlement';
import './styles.css';

const players: Player[] = [
  { id: 'alice', nickname: 'Alice', preferredPayment: 'CASH' },
  { id: 'bob', nickname: 'Bob', preferredPayment: 'LIGHTNING', lightningAddress: 'bob@example.test' },
  { id: 'charlie', nickname: 'Charlie', preferredPayment: 'ANY' },
];

export default function App() {
  const [currency, setCurrency] = useState<Currency>('EUR');
  const [buyIn, setBuyIn] = useState(20);
  const [dealerEnabled, setDealerEnabled] = useState(false);
  const [dealerPercent, setDealerPercent] = useState(10);
  const [stacks, setStacks] = useState<Record<string, number>>({ alice: 20, bob: 20, charlie: 20 });

  const game: Game = useMemo(() => ({
    id: 'demo-game',
    currency,
    buyInAmount: buyIn,
    rebuyEnabled: true,
    rebuyAmount: buyIn,
    chipValue: 1,
    status: 'SETTLING',
    dealer: dealerEnabled ? { enabled: true, mode: 'PERCENT', value: dealerPercent } : { enabled: false, mode: 'NONE' },
    createdAt: new Date().toISOString(),
  }), [currency, buyIn, dealerEnabled, dealerPercent]);

  const contributions: Contribution[] = players.map((player) => ({
    id: `buyin-${player.id}`,
    gameId: game.id,
    playerId: player.id,
    kind: 'BUYIN',
    method: player.id === 'bob' ? 'LIGHTNING' : 'CASH',
    amount: buyIn,
    status: 'PAID',
    createdAt: game.createdAt,
    paidAt: game.createdAt,
  }));

  const finalStacks: FinalStack[] = players.map((player) => ({ playerId: player.id, chips: stacks[player.id] ?? 0 }));
  const settlement = calculateSettlement(game, players, contributions, finalStacks);

  return (
    <main className="shell">
      <header>
        <div>
          <p className="eyebrow">Private prototype</p>
          <h1>NOIOU</h1>
          <p className="tagline">La partie reste physique. NOIOU s'occupe seulement de la caisse et du règlement.</p>
        </div>
        <span className="badge">Non-custodial by design</span>
      </header>

      <section className="card grid">
        <label>Devise
          <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
            <option>EUR</option><option>USD</option><option>SATS</option>
          </select>
        </label>
        <label>Cave
          <input type="number" min="1" value={buyIn} onChange={(e) => setBuyIn(Number(e.target.value))} />
        </label>
        <label className="check"><input type="checkbox" checked={dealerEnabled} onChange={(e) => setDealerEnabled(e.target.checked)} /> Dealer présent</label>
        {dealerEnabled && <label>Rémunération dealer (%)
          <input type="number" min="0" max="100" value={dealerPercent} onChange={(e) => setDealerPercent(Number(e.target.value))} />
        </label>}
      </section>

      <section className="card">
        <div className="section-title"><h2>Stacks finaux</h2><span>{players.length} joueurs</span></div>
        {players.map((player) => (
          <div className="row" key={player.id}>
            <div><strong>{player.nickname}</strong><small>{player.preferredPayment}</small></div>
            <input aria-label={`Stack ${player.nickname}`} type="number" min="0" value={stacks[player.id] ?? 0} onChange={(e) => setStacks({ ...stacks, [player.id]: Number(e.target.value) })} />
          </div>
        ))}
      </section>

      <section className={`card ${settlement.balanced ? 'ok' : 'blocked'}`}>
        <div className="section-title"><h2>Contrôle</h2><strong>{settlement.balanced ? 'ÉQUILIBRÉ ✓' : 'RÈGLEMENT BLOQUÉ'}</strong></div>
        <p>Jetons émis : {settlement.issuedChips} · Jetons comptés : {settlement.countedChips}</p>
        {!settlement.balanced && <p>Écart : {settlement.chipDifference > 0 ? '+' : ''}{settlement.chipDifference} jetons. Corrige le comptage avant tout règlement.</p>}
        {settlement.balanced && (
          <>
            <p>Dealer : {settlement.dealerCompensation.toFixed(2)} {currency} · Joueurs : {settlement.distributableAmount.toFixed(2)} {currency}</p>
            <div className="payouts">
              {settlement.payouts.map((payout) => {
                const player = players.find((p) => p.id === payout.playerId)!;
                return <div className="payout" key={payout.playerId}><span>{player.nickname}</span><strong>{payout.amount.toFixed(2)} {currency}</strong><small>{payout.method}</small></div>;
              })}
            </div>
          </>
        )}
      </section>

      <section className="card donation">
        <div><h2>Soutenir NOIOU</h2><p>Les dons sont toujours volontaires et totalement séparés de la cagnotte.</p></div>
        <button disabled>⚡ Don Lightning — bientôt</button>
      </section>
    </main>
  );
}
