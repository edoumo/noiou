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

## Private foundation currently implemented

- mobile-first React/TypeScript interface with a four-step table workflow;
- PWA manifest and production service worker shell;
- cash buy-ins and rebuys;
- mock Lightning invoices with scannable QR codes and mock outgoing payments;
- isolated **real NWC receive-only diagnostic** using `get_info`, `make_invoice` and `lookup_invoice`;
- hard rejection of NWC connections exposing outgoing payment permissions;
- NWC credential kept only in volatile browser memory, never in backups or the game ledger;
- EUR/USD/SATS settlement with a locked manual fiat/BTC rate in the prototype;
- final physical chip reconciliation and settlement blocking on mismatch;
- explicit player payout confirmation and game-close gate;
- optional fixed/percentage dealer compensation;
- SHA-256 chained append-only audit ledger with tamper tests;
- automatic local session recovery after reload/crash;
- portable JSON backups with SHA-256 integrity and audit-ledger verification;
- framework-independent domain/settlement logic;
- `LightningAdapter` boundary for NWC and future optional LNbits adapters;
- real outgoing NWC payments remain **disabled by design**;
- CI: production dependency audit, strict typecheck, tests and production build.

## Development

```bash
npm install
npm run dev
npm test
npm run build
```

The NWC diagnostic may create and receive a real Lightning payment, but it is deliberately outside the game pot and ledger. Real NWC buy-ins/rebuys and real payouts are **not** enabled yet.

Before a physical dry run, read `docs/TABLE_TEST.md`. NWC security constraints are in `docs/NWC_SECURITY.md`.

See also `docs/V1_SCOPE.md`, `ARCHITECTURE.md`, `SECURITY.md` and `docs/REGULATORY_BOUNDARIES.md` for the current design constraints.
