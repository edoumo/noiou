# Security policy

NOIOU v1.0.0 is deployed in production. Real funds are supported only for **receive-only** Lightning buy-ins credited to the organizer's own wallet, under the safeguards below. Autonomous outgoing Lightning payments remain out of scope; legal validation is still required before commercial operation.

## Security invariants

- No seeds or private keys in the server, repository, logs, analytics, or support tooling.
- No omnibus wallet and no internal BTC balances held on behalf of users.
- Real Lightning game receipts use receive-only NWC permissions; outgoing payment capabilities are rejected.
- The NWC credential stays in browser memory and is never stored in the generic session snapshot, backup, audit ledger, container environment, or static bundle.
- Real NWC game receipts are **SATS-only**; EUR/USD remain limited to cash or the external-wallet flow until money representation is migrated away from generic JavaScript-number fiat arithmetic.
- The mock "fictional payment" receive mode is compiled out of the production experience: it is unavailable in production builds, rejected by runtime guards, and legacy sessions that used it are migrated to the explicit external/manual flow with fictional receipts cancelled.
- All money-changing operations must be idempotent.
- A paid contribution may issue value once only.
- One external Lightning invoice reference cannot be attached to multiple contributions.
- A confirmed payout cannot result in a second payout attempt through normal state transitions.
- Settlement is blocked if final physical chips do not reconcile exactly with issued chips.
- Once a balanced final-stack snapshot is accepted, it is locked before payouts begin.
- Project donations are outside the game-pot accounting domain.
- Dealer compensation must be explicit in the game configuration and separately confirmed.
- Game closure is impossible while a non-zero player payout or dealer compensation remains unconfirmed.
- Outgoing Lightning settlements are manual operator actions performed in the organizer's own wallet; NOIOU only records the confirmation afterward.

## Current controls

- `LightningAdapter` keeps wallet integration outside business logic.
- `MockLightningAdapter` supports development and automated tests only; production builds strip the mock receive mode from the UI, reject it at runtime and migrate legacy mock sessions to the external/manual flow.
- `NwcReceiveOnlyAdapter` supports real invoice creation/status lookup while rejecting connections that expose outgoing-payment methods.
- Connecting a wallet does not by itself arm real game receipts; arming is explicit.
- Once a live game is committed to real NWC receipts, reload/disconnect cannot silently fall back to a fictional path.
- Real NWC game invoice creation fails closed unless the persisted active game is readable and denominated in SATS.
- Per-invoice real-game receipts are capped by `MAX_LIVE_GAME_INVOICE_SATS`; first real tests should stay far below that ceiling.
- Contribution guards reject duplicate invoice references and invalid state changes.
- Settlement tests exercise conservation, cash/Lightning mixes, rebuys, invalid stacks and sats rounding.
- A SHA-256 chained append-only event ledger detects payload modification, event deletion and reordering.
- Portable backups include an integrity digest and ledger verification; NWC credentials are excluded.
- CI runs production dependency audit, strict TypeScript checking, automated tests, application build, production Docker build, and a hardened-container health smoke test.
- The application is deployed behind Cloudflare Tunnel with no application host port published; production and hors-production environments are fully separated (containers, networks, credentials, data).

## Threats before public release

- replayed/duplicated Lightning invoices and event replay;
- duplicate cash confirmations and organizer fraud (cash confirmation is necessarily a human attestation);
- double payouts and concurrent-device race conditions;
- tampering with final stacks or a locked exchange rate;
- compromised NWC secrets or over-broad wallet permissions;
- XSS, CSRF where applicable, IDOR and unsafe deep links;
- local-device compromise and extraction of in-memory wallet connection material;
- crash recovery during invoice/payment/settlement transitions;
- durable ledger alteration, rollback and backup restoration semantics;
- dependency/supply-chain compromise and reproducible dependency locking;
- malicious or misleading forks impersonating the official NOIOU application.

## Real-wallet gate

Receive-only NWC is enabled only for private-alpha inbound receipts. Any expansion of real-wallet capabilities requires a dedicated review covering:

1. least-privilege wallet capabilities;
2. secret storage and lifecycle;
3. exact integer money representation for every enabled currency;
4. explicit user approval before any outgoing payment capability;
5. idempotency and replay protection;
6. recovery after partial failure;
7. browser/device compromise and session restoration;
8. regulatory boundary review.

No statement in this repository should claim that the software is exempt from MiCA or other regulation. The architecture is intended to minimize custody and regulated-service exposure; legal validation is required before commercial/public operation.
