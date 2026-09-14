# Phoenix / manual Lightning receipts

NOIOU supports two real incoming Lightning paths for game buy-ins and rebuys:

1. **NWC receive-only**: NOIOU creates the invoice in the organizer wallet and verifies settlement automatically.
2. **Manual external wallet**: designed for wallets such as Phoenix mobile when the organizer does not expose NWC. NOIOU shows the organizer's reusable Lightning destination and the exact SATS amount. The organizer verifies the incoming payment in the wallet, then explicitly confirms it in NOIOU.

## Safety boundary

Manual receipt confirmation is an organizer attestation. NOIOU does **not** query the wallet, does not control funds, and does not infer payment from a QR scan.

- real manual Lightning receipts are restricted to SATS games while the fiat money model still uses JavaScript numbers;
- the organizer destination must be reusable (Lightning Address, BOLT12 offer, or LNURL);
- a contribution stays `PENDING` until the organizer confirms receipt;
- no chips should be issued before that confirmation;
- the ledger records `LIGHTNING_MANUAL_RECEIPT_CONFIRMED` and `CONTRIBUTION_PAID` with `verification=MANUAL_EXTERNAL_WALLET`;
- outgoing Lightning remains manual in the organizer wallet.

## Phoenix flow

At game creation, choose **Wallet externe (Phoenix / autre)** and scan or paste the organizer's reusable BOLT12 offer from Phoenix. For each Lightning buy-in/rebuy, NOIOU shows:

- the exact amount in sats;
- a QR containing the reusable organizer destination;
- a warning that the sender may need to enter the displayed amount in their wallet;
- an explicit organizer checkbox before confirmation.

This mode deliberately favors compatibility over automated verification. NWC remains the preferred path when automatic settlement verification is required.
