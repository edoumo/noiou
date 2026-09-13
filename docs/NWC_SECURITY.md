# NWC security boundary

Nostr Wallet Connect is planned as NOIOU's preferred non-custodial Lightning integration, but live transport is intentionally disabled in the private prototype.

## Current policy

The code may parse and validate an NWC connection URI locally, but must not send it to a NOIOU backend, analytics service, error tracker or log.

The current safe policy requires:

- invoice creation capability;
- invoice lookup capability;
- secure `wss://` relay URLs;
- interactive user confirmation;
- **no live outgoing payment capability**.

`SAFE_NWC_POLICY.allowOutgoingPayments` therefore remains `false`.

## Secret handling

An NWC secret is credential material.

It must never be:

- committed to git;
- written to the audit ledger;
- included in a portable session backup;
- sent to a hosted NOIOU backend;
- copied into crash reports or telemetry;
- shown again after connection except through an explicit local security action.

When live NWC support is implemented, the secret should remain on the organizer's device and be stored using the strongest practical browser/platform storage available for a PWA. Persistence must be reviewed before enabling real funds.

## Outgoing payments

Automatic server-side payouts are out of scope.

Before enabling an outgoing NWC payment path, NOIOU requires a dedicated review of:

1. regulatory implications of transferring crypto-assets on behalf of users;
2. wallet permission scoping and budgets;
3. explicit interactive confirmation semantics;
4. idempotency and crash recovery;
5. destination verification;
6. replay resistance;
7. maximum per-payment/session limits;
8. incident response for a compromised local device.

Until that review is complete, real outgoing NWC payments remain disabled by design.
