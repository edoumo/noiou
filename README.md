# NOIOU

Private incubation repository. Not for public distribution.

NOIOU is a settlement companion for **physical** poker games. It does not deal cards, run games, provide matchmaking, or custody player funds.

## V1 principles

- physical cards and chips stay at the table;
- game currency: EUR, USD, or SATS;
- buy-ins and rebuys are recorded only after cash confirmation or Lightning payment confirmation;
- final chip totals must reconcile before settlement;
- dealer compensation is explicit and configured separately;
- project donations are voluntary and **never part of the pot**;
- Lightning is non-custodial by design: NOIOU must not hold seeds, private keys, omnibus balances, or player funds;
- zero rake, zero hidden fees.

## Development

```bash
npm install
npm run dev
npm test
npm run build
```

Current work happens on private branches until the project is ready for a public open-source release.
