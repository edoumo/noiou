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
- mock Lightning invoices with scannable QR codes and mock outgoing payments (no real sats);
- EUR/USD/SATS settlement with a locked manual fiat/BTC rate in the prototype;
- final physical chip reconciliation and settlement blocking on mismatch;
- explicit player payout confirmation and game-close gate;
- optional fixed/percentage dealer compensation;
- SHA-256 chained append-only audit ledger with tamper tests;
- automatic local session recovery after reload/crash;
- portable JSON backups with SHA-256 integrity and audit-ledger verification;
- framework-independent domain/settlement logic;
- `LightningAdapter` boundary for future NWC and optional LNbits adapters;
- guarded NWC URI/policy groundwork with **live outgoing payments disabled**;
- CI: production dependency audit, strict typecheck, tests and production build.

## Development

```bash
npm install
npm run dev
npm test
npm run build
```

No real-wallet integration is enabled. Do not use this private prototype with real funds.

Before a physical dry run, read `docs/TABLE_TEST.md`. NWC security constraints are in `docs/NWC_SECURITY.md`.

See also `docs/V1_SCOPE.md`, `ARCHITECTURE.md`, `SECURITY.md` and `docs/REGULATORY_BOUNDARIES.md` for the current design constraints.
