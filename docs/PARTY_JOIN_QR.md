# Party join QR — private alpha

NOIOU can exchange player registration data between two phones without a backend account, relay, wallet authorization or custody component.

## Flow

1. The organizer starts a game and opens **QR de partie**.
2. The invite QR contains an HTTPS URL with a versioned payload: game id, currency, buy-in amount and creation timestamp.
3. The participant scans it with the phone camera or NOIOU, enters their own nickname, payment preference and optional reusable Lightning destination.
4. NOIOU shows a **response QR** on the participant phone.
5. The organizer scans that response QR.
6. The organizer's NOIOU validates the game id, the current ledger, duplicate nickname and Lightning destination format, appends the player and a `PLAYER_JOINED` event, then reloads the local session.

Joining never creates or confirms a buy-in and never issues chips. The normal cash/Lightning receipt workflow still applies afterwards.

## Why two QR scans?

The current architecture has no backend or relay. A QR scanned by phone B cannot directly mutate browser storage on phone A. A one-scan automatic return therefore needs a rendezvous channel (for example an ephemeral relay) or another transport. The private-alpha implementation deliberately uses a two-scan handshake instead of silently introducing such infrastructure.

A later transport can reuse the same versioned invite/response payloads. NFC can likewise carry these payloads on browsers/devices that support it.

## Data in the QR payloads

The invite contains game metadata only. The response contains participant-provided registration data only. Neither contains wallet seeds, private keys, NWC URIs, Basic Auth credentials or payment authorization.
