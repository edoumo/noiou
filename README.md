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
- **production builds offer two real receive flows only: automatic NWC (when armed) or an external wallet with manual confirmation**; the legacy "Mock / test" mode is stripped from production builds and remains a development/CI tool;
- **real NWC receive-only buy-ins and rebuys** using `get_info`, `make_invoice` and `lookup_invoice`;
- **real NWC game receipts are SATS-only in the private alpha**; EUR/USD games rely on cash or the external-wallet flow while exact fiat minor-unit accounting is still pending;
- real NWC receipts credit the organizer's wallet directly; NOIOU never receives or holds the sats;
- wallet connection starts diagnostic-only: **real game receipts require explicit arming**;
- once an active game is committed to real NWC receipts, disconnect/reload cannot silently fall back to a fictional path;
- a Lightning contribution becomes `PAID` only after the wallet reports the invoice settled, or after the organizer explicitly confirms an exact BOLT11 receipt from the external wallet;
- hard rejection of NWC connections exposing outgoing payment permissions;
- NWC credential kept only in volatile browser memory, never in backups or the game ledger;
- private-alpha live-invoice cap of 250,000 sats per cave/rebuy; first real tests should use tiny amounts far below that ceiling;
- EUR/USD/SATS settlement with a locked manual fiat/BTC rate in the prototype;
- legacy local sessions created in the retired mock mode are migrated to the external/manual flow at boot, with fictional receipts cancelled so they can never count as real money;
- final physical chip reconciliation and settlement blocking on mismatch;
- outgoing Lightning payouts are **manual outside NOIOU** and only confirmed in the ledger after the organizer says the wallet payment was made;
- explicit player payout confirmation and game-close gate;
- optional fixed/percentage dealer compensation;
- SHA-256 chained append-only audit ledger with tamper tests;
- automatic local session recovery after reload/crash;
- portable JSON backups with SHA-256 integrity and audit-ledger verification;
- framework-independent domain/settlement logic;
- `LightningAdapter` boundary for NWC and future optional LNbits adapters;
- real outgoing NWC payments remain **disabled by design**;
- production Docker/nginx packaging for the authenticated private alpha, with read-only runtime, no-new-privileges and no application host port publication;
- CI: production dependency audit, strict typecheck, automated tests, application build, Docker build and hardened-container smoke test.

## Private alpha deployment

The current alpha is served at `https://alpha.noiou.io` behind an authenticated origin and Cloudflare Tunnel. The application container itself publishes no host port. Deployment instructions and invariants are documented in `docs/ALPHA_DEPLOYMENT.md`.

The alpha is **not production-ready**. Real-money testing is limited to controlled, deliberately tiny receive-only NWC tests in SATS. Outgoing Lightning payments remain manual in the organizer's own wallet.

## Development

```bash
npm install
npm run dev
npm test
npm run build
```

A receive-only NWC wallet can be connected for diagnostics without enabling real caves. Real game receipts require an explicit acknowledgement/arming action. If an active game has already committed to NWC real receipts, NOIOU keeps that mode locked across disconnect/reload and requires the wallet to be reconnected instead of silently switching to a fictional path. The NWC URI/secret itself is never persisted. Real outgoing payouts are not executed by NOIOU.

The retired "Mock / test" receive mode is available only in development and automated tests (`npm run dev`, `npm test`): a production build never exposes it, rejects it at runtime and migrates legacy local sessions to the external/manual wallet flow.

Before a physical dry run, read `docs/TABLE_TEST.md` and `docs/MOBILE_ALPHA.md`. NWC security constraints are in `docs/NWC_SECURITY.md`.

See also `docs/V1_SCOPE.md`, `ARCHITECTURE.md`, `SECURITY.md` and `docs/REGULATORY_BOUNDARIES.md` for the current design constraints.
