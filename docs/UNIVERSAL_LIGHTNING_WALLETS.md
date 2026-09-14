# Universal Lightning wallet support

NOIOU targets Lightning capabilities and standards rather than a hard-coded wallet allow-list.

Reference wallets for private-alpha QA include Phoenix and Blink, but the application must remain usable with any Lightning wallet that can expose at least one compatible receive/payment primitive.

## Organizer receive modes

### NWC receive-only

When the organizer wallet exposes Nostr Wallet Connect with the required read/receive methods, NOIOU can create incoming invoices and verify settlement automatically. Spending remains forbidden.

### External wallet, manual verification

For wallets without NWC, a SATS game can use `EXTERNAL_WALLET_MANUAL`.

The organizer may either:

- configure a reusable Lightning destination (Lightning Address, BOLT12 offer or LNURL), or
- leave the reusable destination empty and generate a BOLT11 invoice for each buy-in/rebuy.

For a reusable destination, NOIOU displays the exact amount to send and the destination QR. For a one-time BOLT11 invoice, NOIOU validates the Bech32 checksum and verifies that the encoded amount exactly equals the expected sats before presenting it to the player.

A contribution remains `PENDING` until the organizer explicitly confirms that the exact amount was observed as received in the external wallet. NOIOU does not query, control, custody or spend from that wallet.

Real external-wallet receipts are SATS-only in the private alpha until the fiat accounting model is migrated away from generic JavaScript `number` values.

## Participant payouts

A participant may save a reusable destination on their player profile, but it is optional even when Lightning is preferred.

At settlement, a player without a reusable destination can generate a one-time BOLT11 invoice for the exact payout amount. NOIOU can scan or accept that invoice, validate its checksum and amount, and then display it to the organizer for manual payment. The organizer still pays in their external wallet and explicitly confirms completion in NOIOU.

## Safety properties

- no wallet seed, private key or spending credential is persisted;
- NWC remains receive-only;
- external-wallet receipts are organizer attestations, never inferred from a QR scan;
- BOLT11 used for a profile is still rejected because it is one-time and expiring;
- BOLT11 is accepted only in a transaction-specific context with exact amount validation;
- outgoing Lightning remains manual outside NOIOU;
- project donations remain separated from game funds.
