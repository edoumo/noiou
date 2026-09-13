# ADR 0004 — Arming real NWC receipts

## Status

Accepted for the private alpha.

## Context

A receive-only NWC connection is useful for diagnostics even when a poker game should stay fully mocked. Treating `wallet connected` as equivalent to `real game funds enabled` creates an avoidable foot-gun: simply testing a connection could make the next buy-in create a real Lightning invoice.

A game also needs a stable receive mode. Switching from mock to real receipts in the middle of an existing game would make accounting and operator expectations harder to audit.

## Decision

NOIOU separates three states:

1. NWC disconnected;
2. NWC connected for diagnostics, but real game receipts **disarmed**;
3. NWC connected and real game receipts **explicitly armed**.

Arming is volatile and is never persisted, backed up, or written to the audit ledger as credential material. Connecting or reconnecting a wallet always resets the armed state to false.

At game creation, NOIOU locks the game's Lightning receive mode to either:

- `MOCK`; or
- `NWC_RECEIVE_ONLY`.

That mode cannot change during the game. A game locked to `NWC_RECEIVE_ONLY` requires a receive-only wallet to be reconnected after a reload before pending invoices can be created or checked. The NWC secret itself is never persisted.

## Consequences

- Merely connecting a wallet cannot accidentally activate real buy-ins.
- A mock game stays mock for its entire lifetime.
- A live-receive game stays live-receive for its entire lifetime, even after a reload; only the credential must be re-supplied.
- Outgoing payments remain manual and outside NOIOU.
