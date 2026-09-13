# NWC security boundary

Nostr Wallet Connect is NOIOU's preferred non-custodial Lightning integration.

A **private receive-only diagnostic** is now implemented. It can connect to a real NWC wallet, create a real Lightning invoice and verify its settlement. This diagnostic is deliberately isolated from game buy-ins, the game ledger and payouts.

## Current policy

The code parses and validates an NWC connection URI locally and must not send it to a NOIOU backend, analytics service, error tracker or log.

The active safe policy requires:

- `get_info`;
- `make_invoice`;
- `lookup_invoice`;
- secure `wss://` relay URLs;
- **no outgoing payment method** such as `pay_invoice`, `pay_keysend`, `multi_pay_invoice` or `multi_pay_keysend`.

A connection exposing an outgoing payment method is rejected instead of silently accepting excess privileges.

`SAFE_NWC_POLICY.allowOutgoingPayments` remains `false`.

## Secret handling

An NWC URI contains credential material.

The private diagnostic keeps the URI only in volatile browser memory for the lifetime of the connection. The input is cleared immediately when a connection attempt begins. Reloading the page therefore requires reconnecting the wallet.

The NWC secret must never be:

- committed to git;
- written to the audit ledger;
- written to localStorage/session backups by the diagnostic;
- sent to a hosted NOIOU backend;
- copied into crash reports or telemetry;
- displayed after connection.

Persistence is intentionally not implemented before a dedicated browser/PWA secret-storage review.

## Real-funds boundary

The diagnostic can receive real sats. It is explicitly marked as outside the game accounting model and caps a diagnostic invoice at 1000 sats.

At this stage:

- real NWC invoices are **not** used for poker buy-ins or rebuys;
- real NWC receipts do not alter the game pot;
- no real payout can be executed by NOIOU;
- no NWC secret is persisted or exported.

This separation allows transport/capability testing without creating a half-real game settlement path.

## Outgoing payments

Automatic server-side payouts are out of scope.

Before enabling any outgoing NWC payment path, NOIOU requires a dedicated review of:

1. regulatory implications of transferring crypto-assets on behalf of users;
2. wallet permission scoping and budgets;
3. explicit interactive confirmation semantics;
4. idempotency and crash recovery;
5. destination verification;
6. replay resistance;
7. maximum per-payment/session limits;
8. incident response for a compromised local device.

Until that review is complete, real outgoing NWC payments remain disabled by design.
