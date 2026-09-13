# NWC security boundary

Nostr Wallet Connect is NOIOU's preferred non-custodial Lightning integration.

A receive-only NWC connection can be used for **real game buy-ins and rebuys**. The organizer's wallet creates the BOLT11 invoice and receives the sats directly. NOIOU only creates and verifies invoices through delegated receive-side NWC capabilities.

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

NOIOU keeps the live NWC client only in volatile browser memory. The URI input is cleared immediately when a connection attempt begins. Reloading the page therefore requires reconnecting the wallet.

The NWC secret must never be:

- committed to git;
- written to the audit ledger;
- written to localStorage or portable session backups;
- sent to a hosted NOIOU backend;
- copied into crash reports or telemetry;
- displayed after connection.

Persistence is intentionally not implemented before a dedicated browser/PWA secret-storage review.

## Explicit arming

Connecting a wallet is **not** enough to enable real game receipts.

A fresh/reconnected wallet starts in diagnostic-only mode. The organizer must explicitly acknowledge that the next Lightning caves/rebuys can move real sats and arm real receipts. This armed flag is volatile and is never persisted.

Once an active game has committed to NWC real receipts (durable `GAME_CREATED` mode and/or a persisted NWC game invoice), NOIOU treats the game as locked to NWC. Disconnecting or reloading does not allow the game to silently fall back to mock. The operator must reconnect the receive-only wallet before creating/checking the next real invoice.

The lock is removed only after the game is closed/reset. This avoids mixing simulated and real Lightning contributions in the same active accounting session.

## Game receive path

When real receipts are armed/locked, a Lightning cave or rebuy follows this sequence:

1. NOIOU calculates the required amount in sats from the game currency and the rate locked for the game.
2. NOIOU asks the organizer's wallet to create a BOLT11 invoice through `make_invoice`.
3. The public invoice/payment hash and its `NWC` source may be stored with the local game session; the NWC secret is not stored.
4. The contribution remains `PENDING`; no chips should be treated as issued yet.
5. NOIOU calls `lookup_invoice` when the organizer asks to verify payment.
6. Only a wallet result mapped to `PAID` changes the contribution to paid and allows the chips to count as issued.

After reload or import, an outstanding NWC invoice remains in the game backup, but the organizer must reconnect the receive-only wallet before NOIOU can verify it.

The private alpha caps each real game invoice at **250,000 sats**. This is a safety guard, not a protocol limitation.

For EUR/USD games the current prototype uses the manually locked BTC/fiat rate. The organizer must verify that rate before starting a real-funds table test.

## Outgoing payments

NOIOU does not execute real outgoing Lightning payments.

Player and dealer Lightning payouts are performed manually in the organizer's wallet. NOIOU only records the organizer's explicit confirmation that the external wallet payment was completed.

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
