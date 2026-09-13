# Security policy (private incubation)

NOIOU is not yet production-ready and must not be used with real funds during private incubation.

## Security invariants

- No seeds or private keys in the server, repository, logs, analytics, or support tooling.
- No omnibus wallet or internal user BTC balances.
- All money-changing operations must be idempotent.
- A paid contribution may issue chips once only.
- A payout may be confirmed once only.
- Settlement is blocked if final chips do not reconcile with issued chips.
- Project donations are outside the game-pot accounting domain.
- Dealer compensation must be explicit and visible before settlement.

## Threats to address before public release

- replayed/duplicated Lightning invoices;
- duplicate cash confirmations;
- double payouts and race conditions;
- tampering with final stacks or locked exchange rates;
- NWC secret theft or over-broad wallet permissions;
- XSS, CSRF where applicable, and IDOR;
- crash recovery during settlement;
- ledger alteration and auditability;
- malicious or misleading forks impersonating the official NOIOU application.

Any real-wallet integration requires a dedicated security review before activation.
