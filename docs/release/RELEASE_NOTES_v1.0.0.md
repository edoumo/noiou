# NOIOU v1.0.0

First stable NOIOU release — production cutover completed.

- Application: <https://app.noiou.io>
- Website: <https://noiou.io>
- Source: <https://github.com/edoumo/noiou> (MIT)

This release corresponds to commit `ebce45af9e95668c379ed744c0739de785bcfc52`, the exact code validated as `v1.0.0-rc1`. No application code changed between the RC and this release; the tag points at the validated code.

## Summary

NOIOU is an open-source settlement companion for **physical** poker games. Cards and chips stay at the table; NOIOU tracks the money side: buy-ins and rebuys, chip counting, and the exact final settlement. It is non-custodial: NOIOU never holds player funds, seeds, or keys, and takes zero rake.

## Features

- four-step table workflow: configure → collect → count → settle;
- EUR / USD / SATS game currencies with a locked manual fiat/BTC rate;
- cash buy-ins and rebuys with explicit confirmation;
- late joins after the game starts;
- dealer compensation (fixed or percentage) and dealer tips, all outside the pot;
- strict chip reconciliation: settlement is blocked until counted chips match issued chips;
- SHA-256 chained append-only audit ledger with tamper tests;
- portable JSON backups with integrity verification;
- PWA: installable, mobile-first (320/360/390) and desktop (1280) layouts validated;
- party-join QR and exact invoice QR with zoom/copy for same-device payment.

## Lightning

- receive-only NWC (Nostr Wallet Connect): `get_info`, `make_invoice`, `lookup_invoice`;
- wallet connections exposing outgoing payment permissions are rejected (least privilege);
- real receipts require explicit arming; once armed, reload/disconnect cannot silently fall back to a fictional path;
- external-wallet flow: the exact BOLT11 receipt is prepared and verified by NOIOU, then confirmed manually by the organizer;
- no outgoing Lightning capability: player/dealer payouts remain manual, in the organizer's own wallet;
- no mock payment path exists in production builds (development/CI only);
- controlled mainnet receive test: PASS (2026-09-18).

## Security

- non-custodial by design: no seeds, no keys, no omnibus balances, no player funds held;
- NWC credential kept only in volatile browser memory, never in backups or the ledger;
- hardened containers: read-only runtime, `no-new-privileges`, no application host port published;
- Cloudflare Tunnel entry points, HTTPS everywhere;
- production and hors-production environments fully separated (containers, networks, configuration, credentials, data);
- production/hors-production cookie and browser-storage isolation (host-only cookies, per-origin storage);
- SHA-256 chained audit ledger; tamper tests in CI.

## Known limitations

- real NWC receipts are SATS-only; EUR/USD games use cash or the external-wallet flow;
- per-invoice live cap: 250,000 sats per buy-in/rebuy;
- local persistence (browser localStorage); no backend and no multi-device sync yet;
- outgoing payouts are manual (outside NOIOU);
- cash confirmation is a human attestation (organizer-confirmed);
- legal/regulatory validation remains required before commercial operation (see `SECURITY.md`).

## Links

- Application: <https://app.noiou.io>
- Website: <https://noiou.io>
- Source code: <https://github.com/edoumo/noiou>
