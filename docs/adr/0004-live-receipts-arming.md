# ADR 0004 — Arming real NWC receipts

## Status

Accepted for the private alpha.

## Context

A receive-only NWC connection is useful for diagnostics even when a poker game should stay fully mocked. Treating `wallet connected` as equivalent to `real game funds enabled` creates an avoidable foot-gun: simply testing a connection could make the next buy-in create a real Lightning invoice.

A game also needs a stable receive mode. Switching between mock and real receipts in the middle of an active game would make accounting and operator expectations harder to audit.

## Decision

NOIOU separates three operational states:

1. NWC disconnected;
2. NWC connected for diagnostics, but real game receipts **disarmed**;
3. NWC connected and real game receipts **explicitly armed**.

For a fresh connection, arming is volatile and is never persisted, backed up, or written to the audit ledger as credential material. Connecting a fresh wallet therefore starts diagnostic-only.

When a game is started while real receipts are armed, the `GAME_CREATED` audit event records `NWC_RECEIVE_ONLY`. A persisted NWC game invoice is also treated as a fail-safe signal. While such a game remains `OPEN` or `SETTLING`, NOIOU locks the active session to NWC real receipts:

- disconnecting removes the credential from memory but **does not** permit mock fallback;
- after reload, NOIOU recovers the NWC requirement from the local session/audit ledger;
- reconnecting the receive-only wallet restores the real-receipt path for that already-locked game;
- the NWC secret itself is never persisted.

The lock is released only after the active game is closed/reset. Outgoing Lightning payments remain manual and outside NOIOU.

## Consequences

- Merely connecting a wallet cannot accidentally activate real buy-ins.
- A game that has committed to real NWC receipts cannot silently mix later mock Lightning contributions after disconnect/reload.
- Recovery requires the operator to re-supply a receive-only NWC credential, not to persist one.
- Existing old sessions are protected by both the durable `GAME_CREATED` mode and persisted `NWC` invoice source when available.
- Outgoing payments remain manual and outside NOIOU.
