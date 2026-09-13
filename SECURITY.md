# Security policy (private incubation)

NOIOU is not production-ready and must not be used with real funds during private incubation.

## Security invariants

- No seeds or private keys in the server, repository, logs, analytics, or support tooling.
- No omnibus wallet and no internal BTC balances held on behalf of users.
- No real Lightning adapter is enabled in the private bootstrap.
- All money-changing operations must be idempotent.
- A paid contribution may issue value once only.
- One external Lightning invoice reference cannot be attached to multiple contributions.
- A confirmed payout cannot result in a second payout attempt through normal state transitions.
- Settlement is blocked if final physical chips do not reconcile exactly with issued chips.
- Once a balanced final-stack snapshot is accepted, it is locked before payouts begin.
- Project donations are outside the game-pot accounting domain.
- Dealer compensation must be explicit in the game configuration and separately confirmed.
- Game closure is impossible while a non-zero player payout or dealer compensation remains unconfirmed.

## Current controls

- `LightningAdapter` keeps wallet integration outside business logic.
- `MockLightningAdapter` supports development without real sats.
- contribution guards reject duplicate invoice references and invalid state changes;
- settlement tests exercise conservation, cash/Lightning mixes, rebuys, invalid stacks and sats rounding;
- a SHA-256 chained append-only event ledger detects payload modification, event deletion and reordering;
- CI runs strict TypeScript checking, automated tests and production build on every bootstrap branch update/PR.

## Threats before public release

- replayed/duplicated Lightning invoices and webhook/event replay;
- duplicate cash confirmations and organizer fraud (cash confirmation is necessarily a human attestation);
- double payouts and concurrent-device race conditions;
- tampering with final stacks or a locked exchange rate;
- compromised NWC secrets or over-broad wallet permissions;
- XSS, CSRF where applicable, IDOR and unsafe deep links;
- local-device compromise and extraction of persisted wallet connection material;
- crash recovery during invoice/payment/settlement transitions;
- durable ledger alteration, rollback and backup restoration semantics;
- dependency/supply-chain compromise;
- malicious or misleading forks impersonating the official NOIOU application.

## Real-wallet gate

Before enabling NWC, LNbits or any other real-wallet integration, require a dedicated review covering:

1. least-privilege wallet capabilities;
2. secret storage and lifecycle;
3. explicit user approval before outgoing payments;
4. idempotency and replay protection;
5. recovery after partial failure;
6. regulatory boundary review.

No statement in this repository should claim that the software is exempt from MiCA or other regulation. The architecture is intended to minimize custody and regulated-service exposure; legal validation is required before commercial/public operation.
