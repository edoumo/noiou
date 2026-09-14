# NOIOU universal UX and wallet roadmap

This document captures product requirements raised during the private alpha and turns them into implementation constraints. It is a roadmap, not a claim that every item is already implemented.

## Dealer model

A dealer may be present with one of three compensation modes:

- `NONE`: dealer present but not remunerated from the pot;
- `FIXED`: fixed amount reserved from the pot;
- `PERCENT`: percentage of the pot reserved from the pot.

`NONE` must not require entering `0%` and must not reserve any money from player settlement.

After settlement, NOIOU should optionally offer a separate dealer tip flow. A voluntary tip is never deducted from the pot or from an already-computed payout. It is a separate transfer initiated by the player after the game. The UI may highlight winners first, while still allowing any player to tip.

## Lightning destinations

The product model must evolve from a field named `lightningAddress` to a generic `lightningDestination`.

Supported destination classes should include at least:

- Lightning Address (`name@example.com`);
- BOLT12 offer (`lno1...`) for reusable wallet destinations, including Phoenix-compatible receive offers;
- QR-scanned Lightning payment destination where applicable;
- future compatible LNURL/BIP URI forms only after explicit parsing/validation.

A one-time BOLT11 invoice must not be treated as a durable player payout address because it expires and is single-use.

Both dealer and player forms should provide paste/manual input plus a camera QR scanner when the browser supports camera access.

## Phoenix compatibility

Phoenix mobile is a priority wallet for NOIOU.

NOIOU must not require NWC for every organizer. The architecture should support two organizer receive modes:

1. `NWC_VERIFIED`: automatic invoice creation and settlement verification through a receive-only NWC connection.
2. `MANUAL_LIGHTNING`: Phoenix-compatible/manual Lightning receipt flow where the organizer validates receipt in their own wallet when no programmable wallet connection is available.

The strict rule remains: chips are only handed out after receipt is confirmed. In manual mode this is an explicit organizer attestation, analogous to cash confirmation.

For payouts to a Phoenix user, prefer reusable BOLT12 offers/QR destinations over an `@`-style Lightning Address requirement.

## NWC help

The NWC panel should explain in plain language that NWC is a remote-wallet control protocol and that a Nostr social client is not automatically an NWC wallet service.

The UI should include:

- a `What is NWC?` help action;
- a short explanation of receive-only permissions;
- examples of compatible wallet-service patterns without requiring a specific vendor;
- an explicit note that Phoenix mobile may use the manual/BOLT12 path when it does not expose an NWC connection URI.

## Rebuy safety

Cash rebuy must require an intermediate confirmation step before the ledger is mutated.

Confirmation should clearly state player, amount, currency and action. `Cancel` must leave state untouched.

The same interaction pattern should be reusable for other irreversible table actions.

## Join by QR

The organizer should be able to display a game join QR.

Scanning the QR should open a join screen where the player can provide:

- nickname;
- preferred payout method;
- optional Lightning destination by paste or QR scan.

Manual player entry by the organizer remains supported.

Automatic roster insertion requires a communication channel between the joining device and organizer device. This must be designed explicitly rather than hidden inside the QR format. A future rendezvous mechanism must not hold funds, wallet credentials or game balances.

## NFC

NFC is a progressive enhancement, never the only join path.

Where Web NFC / NDEF is available, NOIOU may read a join URL or Lightning destination from an NFC tag/device. QR remains the universal fallback, especially on browsers/platforms without Web NFC support.

## Internationalization

The application must be i18n-ready before broad UI expansion.

Requirements:

- no new user-facing text should be embedded directly in business/domain logic;
- locale selection stored locally;
- default locale may follow the device/browser;
- user can override locale manually;
- French and English become reference catalogs first;
- broader translation set is finalized late in the project.

Target language set includes at minimum French, English, German, Spanish, Italian, Portuguese, Danish, Croatian, Bulgarian, Greek, Finnish, Hungarian, Japanese and Korean, and may be expanded to match the final Mailcow-style locale set requested for the product.

Language selector should use localized language names; flags may be shown as visual hints but must not be the sole language identifier.

## Theme

Theme preference must support:

- `AUTO` (default, follows system preference);
- `LIGHT`;
- `DARK`.

The selected preference is stored locally and must be changeable from the UI.

## Haptics and sound

Interaction feedback must be configurable locally:

- haptics on/off;
- button click sound on/off;
- payment/rebuy confirmation sound on/off.

Defaults should be conservative. Feedback must never be the only confirmation mechanism and must respect browser/device capability and user settings.

A distinct receipt sound can be used after a successful cash/Lightning confirmation so people around the table receive an audible cue, but financial state remains determined exclusively by the ledger/state transition.

## Architecture constraints

These features must preserve existing invariants:

- no custody;
- no server-side wallet secrets;
- no automatic outgoing NWC payments in the current private alpha;
- project donations remain outside the poker pot;
- dealer tips remain outside the poker pot;
- local-first game state where practical;
- exact settlement conservation;
- explicit confirmation for irreversible actions;
- QR/NFC parsing must treat scanned content as untrusted input.
