# Private table test protocol

NOIOU is still a private alpha. Start with a full mock dry run. A second, controlled pass may use small real NWC receive-only buy-ins/rebuys after the mock flow passes.

## Goal

Validate the physical-table workflow with real cards/chips, then validate that receive-only Lightning credits the organizer's own wallet without giving NOIOU any outgoing-payment capability.

## Pass A — zero real funds

1. Create a game in EUR with a small fictional buy-in.
2. Add 3-5 players using only pseudonyms.
3. Keep NWC disconnected and mix cash and mock-Lightning buy-ins.
4. Add at least one rebuy.
5. Reload the page mid-game and verify automatic local recovery.
6. Export a portable JSON backup.
7. Finish the physical game and enter final chip counts.
8. Deliberately enter a wrong chip total once and confirm settlement is blocked.
9. Correct the count, confirm all mock/cash payouts and close the game.
10. Export the closed-game backup.
11. Reset local state and import the backup to validate recovery.

## Pass B — small real NWC receive-only test

Do this only after Pass A is clean.

1. In the NWC panel, connect a dedicated NWC URI exposing only `get_info`, `make_invoice` and `lookup_invoice`.
2. Confirm NOIOU reports `RECEIVE ONLY`. If the wallet grants any outgoing payment method, STOP and revoke/recreate the connection.
3. Prefer a SATS game for the first real test so there is no fiat-rate ambiguity. Use a very small cave well below the 250,000-sat alpha ceiling.
4. Add one player and choose **Cave Lightning réel**.
5. Confirm the displayed invoice is marked `NWC réel`, then pay it from a separate Lightning wallet.
6. Before pressing **Vérifier le paiement**, confirm the contribution is still `PENDING` and that settlement would remain blocked.
7. Press **Vérifier le paiement**. Only after `lookup_invoice` reports the invoice settled should the contribution become `PAID`.
8. Issue the physical chips only after that paid state is visible.
9. Perform one small real NWC rebuy and verify the same sequence.
10. Reload the page while a real NWC invoice is pending. Confirm the game/invoice remains restored but the NWC credential is gone; reconnect the same receive-only wallet, then verify settlement.
11. Finish the game normally. For any Lightning payout, pay manually in the organizer's wallet first, then use NOIOU only to confirm that the external payment was completed.
12. Export a backup and inspect it: BOLT11/payment references may be present, but no NWC URI/secret may appear.

## PASS criteria

- no chips are considered issued before a contribution is paid;
- pending Lightning contributions block settlement;
- a real NWC contribution becomes paid only after wallet settlement lookup;
- reconnect-after-reload works without persisting the NWC secret;
- real receive-side sats go directly to the organizer's wallet;
- no outgoing NWC payment path exists;
- Lightning payouts are manual outside NOIOU;
- final chip mismatch blocks settlement;
- no payout can be required twice after confirmation;
- dealer compensation is explicit;
- project donations never change pot accounting;
- audit ledger remains valid after reload/export/import;
- backup tampering is rejected;
- no wallet seed, private key or NWC secret is present in local backups;
- UI remains usable on a phone held at the table.

## STOP criteria

Stop immediately if the audit ledger becomes invalid, a backup cannot be verified, a confirmed payment can be repeated, any secret wallet material appears in persisted/exported state, the NWC connection exposes an outgoing payment capability, or NOIOU marks a real Lightning contribution paid before the organizer wallet reports the invoice settled.
