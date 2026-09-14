# NOIOU — Lightning destinations and Phoenix

NOIOU keeps incoming game funds and outgoing payouts non-custodial.

## Reusable payout destinations

Player and dealer profiles accept reusable Lightning destinations:

- Lightning Address (`user@domain`)
- BOLT12 offer (`lno1…`), including QR codes shown by wallets such as Phoenix
- encoded LNURL (`lnurl1…`)

A BOLT11 invoice can be scanned and recognized, but it is intentionally rejected when saving a player/dealer profile because it is a one-time, expiring payment request.

QR payloads prefixed with `lightning:` and Lightning values embedded in BIP21 (`lightning=`, `lno=` or `lnurl=`) are normalized before storage.

## Camera privacy

QR scanning runs in the browser on the user's device through the camera stream. NOIOU does not upload the camera stream to a project backend.

## Phoenix scope

Phoenix mobile can be used as a payout destination by scanning its reusable BOLT12 QR into a player or dealer profile. Outgoing settlement remains manual in the organizer's external wallet; NOIOU never receives spend permission.

Automated incoming game receipts are still a separate feature: in the current alpha they require an organizer wallet connection through receive-only NWC. Phoenix destination support does not imply NWC support in Phoenix mobile.

## Next steps

- allow adding/updating a payout destination during settlement, not only when a player joins;
- add the ephemeral join-by-QR flow for player self-registration;
- add optional NFC handoff where the browser/platform supports it;
- add a manual organizer receipt mode for wallets without NWC, with explicit confirmation and audit semantics.
