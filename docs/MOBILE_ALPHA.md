# Mobile table alpha guide

This private alpha is designed to be operated from one organizer phone while cards and chips stay physical.

## Before players sit down

1. Open NOIOU on the organizer phone.
2. Decide whether the game is **MOCK** or **real receive-only NWC**.
3. **Real NWC game receipts are SATS-only in this alpha.** EUR/USD remain available in mock mode only until the accounting model is migrated away from generic JavaScript-number fiat arithmetic.
4. If using real NWC, connect a dedicated receive-only authorization, verify it exposes no outgoing payment method, acknowledge the warning, then explicitly arm real receipts.
5. For the very first real test, use deliberately tiny amounts (for example 100–1,000 sats per cave) even though the technical per-invoice safety ceiling is higher.
6. Create the game only after the receive mode is correct. The game receive mode is then stable for the whole session.

## During the game

- Cash: hand out chips only after tapping the cash-received action.
- Lightning: hand out chips only after the invoice is `PAID`.
- A pending NWC invoice after reload requires reconnecting the same receive-only wallet before verification.
- A live NWC game never silently falls back to mock.
- A real NWC invoice is refused if the persisted active game is not denominated in SATS or if the session cannot be trusted/read.

## Settlement on a phone

When final chip reconciliation is balanced, each payout becomes an operator task.

For a Lightning payout NOIOU shows:

- beneficiary;
- exact amount in sats;
- destination supplied for that player/dealer;
- a copy button for the destination;
- a copy button for the full instruction.

NOIOU **does not execute the payout**. The organizer performs it in their own wallet. The payout can only be marked confirmed after explicitly checking the acknowledgement containing the exact sat amount.

A player configured as `ANY` must have the final payout method selected before confirmation. Lightning is unavailable if no Lightning destination was provided.

## First real-receipt PASS criteria

Use a dedicated receive-only NWC authorization and a SATS-denominated game with tiny amounts.

- connecting the wallet alone does not arm real receipts;
- the wallet exposes no outgoing payment capability;
- a real cave creates an NWC invoice to the organizer wallet;
- chips are not considered paid before `lookup_invoice` reports the invoice paid;
- after payment, the contribution becomes `PAID` exactly once;
- reload with an outstanding NWC invoice requires reconnecting the same receive-only wallet;
- after reconnect, the pending invoice can be checked without creating a replacement invoice;
- disconnecting/reloading never silently falls back to mock;
- EUR/USD active games cannot create real NWC game invoices;
- no NWC credential appears in localStorage, backups, the audit ledger, Docker environment, or static assets;
- outgoing Lightning settlements remain manual outside NOIOU.

## Phone PASS criteria

- primary actions are usable one-handed without horizontal scrolling;
- invoice QR is readable from a second phone;
- NWC mode is obvious: mock, diagnostic, real armed, or reconnect required;
- accidental wallet connection alone cannot make a game real;
- outgoing Lightning confirmations require a deliberate two-step acknowledgement;
- game closure remains blocked while any positive payout is not confirmed;
- no NWC credential appears in session backups or the audit ledger.
