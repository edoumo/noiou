# Mobile table alpha guide

This private alpha is designed to be operated from one organizer phone while cards and chips stay physical.

## Before players sit down

1. Open NOIOU on the organizer phone.
2. Decide whether the game is **MOCK** or **real receive-only NWC**.
3. For the first tests, prefer SATS to avoid fiat-rate ambiguity.
4. If using real NWC, connect a dedicated receive-only authorization, verify it exposes no outgoing payment method, acknowledge the warning, then explicitly arm real receipts.
5. Create the game only after the receive mode is correct. The game receive mode is then stable for the whole session.

## During the game

- Cash: hand out chips only after tapping the cash-received action.
- Lightning: hand out chips only after the invoice is `PAID`.
- A pending NWC invoice after reload requires reconnecting the same receive-only wallet before verification.
- A live NWC game never silently falls back to mock.

## Settlement on a phone

When final chip reconciliation is balanced, each payout becomes an operator task.

For a Lightning payout NOIOU shows:

- beneficiary;
- exact amount in sats, using the game-locked rate when the game currency is fiat;
- destination supplied for that player/dealer;
- a copy button for the destination;
- a copy button for the full instruction.

NOIOU **does not execute the payout**. The organizer performs it in their own wallet. The payout can only be marked confirmed after explicitly checking the acknowledgement containing the exact sat amount.

A player configured as `ANY` must have the final payout method selected before confirmation. Lightning is unavailable if no Lightning destination was provided.

## Phone PASS criteria

- primary actions are usable one-handed without horizontal scrolling;
- invoice QR is readable from a second phone;
- NWC mode is obvious: mock, diagnostic, real armed, or reconnect required;
- accidental wallet connection alone cannot make a game real;
- outgoing Lightning confirmations require a deliberate two-step acknowledgement;
- game closure remains blocked while any positive payout is not confirmed;
- no NWC credential appears in session backups or the audit ledger.
