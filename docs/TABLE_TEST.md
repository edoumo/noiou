# Private table test protocol

NOIOU is still a private prototype. Do not use real Lightning funds yet.

## Goal

Validate the physical-table workflow with real cards/chips while all Lightning operations remain mocked.

## Suggested dry run

1. Create a game in EUR with a small fictional buy-in.
2. Add 3-5 players using only pseudonyms.
3. Mix cash and mock-Lightning buy-ins.
4. For Lightning, scan the displayed QR from a second device only to validate legibility; do not expect it to be a real BOLT11 invoice.
5. Add at least one rebuy.
6. Reload the page mid-game and verify automatic local recovery.
7. Export a portable JSON backup.
8. Finish the physical game and enter final chip counts.
9. Deliberately enter a wrong chip total once and confirm settlement is blocked.
10. Correct the count, confirm all mock/cash payouts and close the game.
11. Export the closed-game backup.
12. Reset local state and import the backup to validate recovery.

## PASS criteria

- no chips are considered issued before a contribution is paid;
- pending Lightning contributions block settlement;
- final chip mismatch blocks settlement;
- no payout can be required twice after confirmation;
- dealer compensation is explicit;
- project donations never change pot accounting;
- audit ledger remains valid after reload/export/import;
- backup tampering is rejected;
- no wallet seed, private key or NWC secret is present in local backups;
- UI remains usable on a phone held at the table.

## STOP criteria

Stop the dry run if the audit ledger becomes invalid, a backup cannot be verified, a confirmed payment can be repeated, or any secret wallet material appears in persisted/exported state.
