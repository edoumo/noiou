# NOIOU v1.0.0-rc1 — Release Candidate

First NOIOU V1 release candidate. Tagged after the UX27 production readiness
gate (mock retirement + Lightning receive qualification).

**This is not the final V1.** Before any real-funds production use, a controlled
mainnet Lightning receive test must be completed. See
`docs/release/V1_RC1_STATUS.md`.

## What is in RC1

- Physical poker table workflow: configure → collect (buy-ins/rebuy) → count
  chips → settle.
- Buy-ins and rebuys: cash confirmation, external-wallet Lightning with exact
  BOLT11 receipt confirmation, and automatic receive-only NWC (explicit arming).
- Late joins after GAME_STARTED, cash and Lightning rebuys, organizer wallet
  allocation without self-transfer.
- Final chip counting with strict reconciliation; settlement is blocked on any
  mismatch.
- Tamper-evident SHA-256 chained audit ledger; portable SHA-256-verified JSON
  backups.
- QR flows: party join QR (deterministic landing after reload, UX26), exact
  invoice QR with zoom/open/copy for same-phone payment.
- Mobile (320/360/390) and desktop (1280) layouts validated.
- Lightning receive paths only:
  - **NWC automatic** — receive-only permissions (`get_info`,
    `make_invoice`, `lookup_invoice`); outgoing payment capabilities are
    rejected by design; every real invoice is created by the organizer's own
    wallet and NOIOU never holds funds;
  - **external wallet / manual validation** — exact BOLT11 QR prepared and
    verified by NOIOU, receipt confirmed by the organizer after checking the
    wallet.
- The legacy "Mock / test" receive mode is removed from the production
  experience (UI, runtime guards, production bundles); it remains available
  only in development and automated tests.
- Legacy local sessions created in the retired mock mode are migrated safely:
  fictional receipts are cancelled (never counted as real money) and the game
  switches to the external/manual flow, recorded in the audit ledger.
- 145/145 unit tests PASS; hardened container CI (typecheck, tests, build,
  Docker smoke test) green.
- **No outgoing Lightning capability**: no `pay_invoice`/`pay_keysend` path
  exists; player/dealer Lightning payouts are manual outside NOIOU.

## Known limits (private alpha)

- Real NWC receipts are SATS-only; EUR/USD games use cash or the
  external-wallet flow.
- Per-invoice alpha ceiling: 250,000 sats.
- Local persistence (browser localStorage, no backend).
- **Mainnet receive test: PENDING** — required before V1 final.

## Verification summary

- starting commit (pre-UX27): `926fa4c4958d2e0b6ce6f227d5e16dc055aba91e`
- RC1 commit: `ebce45af9e95668c379ed744c0739de785bcfc52` (merge of UX27 PR #32)
- UX27 fix commit: `950e5a51975705ec33b114b2e70e02f391efde7d`
- CI on RC1 commit: quality = success
- Deployment: VM126, container `noiou-alpha-app` healthy, no host ports
  published, `https://alpha.noiou.io` authenticated alpha (anon 401 / auth 200).
