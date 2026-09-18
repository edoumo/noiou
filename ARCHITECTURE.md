# Architecture

## Goal

NOIOU is a local-first PWA for tracking money around a physical poker table. It is not an online poker product and must not custody player funds.

## Initial shape

- React + TypeScript PWA client.
- Domain logic kept framework-independent.
- `LightningAdapter` boundary isolates wallet integrations from settlement logic.
- Receive flows: real receive-only NWC (automatic, explicit arming) and external wallet with manual BOLT11 receipt confirmation. The legacy mock adapter is a development/test tool, unavailable in production builds.
- Persistence/backend are intentionally deferred until the local domain model and invariants are stable.

## Non-custodial boundary

NOIOU must never require or store a wallet seed or private key. Future NWC integration should use the minimum capabilities required and keep spending credentials on the organizer's device whenever feasible. A hosted backend must not become an omnibus wallet or maintain crypto balances for users.

Real incoming value flows through receive-only NWC or the external-wallet manual receipt flow. NOIOU cannot move funds out, never takes custody, and never stores seeds or private keys.

## Accounting boundaries

Three flows are distinct:

1. Player pot: paid buy-ins/rebuys and player payouts.
2. Dealer compensation: explicit rule configured before the game starts.
3. Project donations: voluntary and outside pot conservation; never deducted silently from player funds.

## Game lifecycle

`OPEN` accepts players, buy-ins and rebuys. A contribution issues value only after it reaches `PAID`.

`SETTLING` freezes new contributions. Final physical chip counts are entered and settlement remains blocked until counted chips exactly match chips issued from paid contributions.

Once a balanced stack snapshot is accepted it is locked in the current prototype. Player payouts and any dealer compensation must all be explicitly confirmed before the game can become `CLOSED`.

## Tamper-evident ledger

Significant financial and lifecycle actions are appended to an in-memory event chain. Every event carries:

- a monotonic sequence number;
- the previous event hash;
- a SHA-256 hash of its canonical content.

This is not a blockchain and does not by itself make a malicious client trustworthy. It provides tamper evidence and establishes the event model needed for durable persistence later. Ledger verification is covered by automated tamper tests.

## Lightning boundary

The business domain depends on `LightningAdapter`, not on LNbits or a specific wallet. The production experience enables `NwcReceiveOnlyAdapter` (real receive-only invoices) and the external-wallet/manual receipt flow; `MockLightningAdapter` remains a development/test tool with no production UI exposure.

Planned order for real integrations:

1. NWC, with least-privilege permissions and secrets retained on the organizer device where feasible.
2. Optional LNbits adapter for self-hosted deployments.

Any real-wallet integration requires a dedicated security and regulatory review before activation.

## Deferred decisions

- durable local storage and encrypted backup/sync model;
- NWC capability details and approval UX;
- optional LNbits self-hosted adapter;
- production fiat/BTC rate provider and authenticated rate-lock semantics;
- authentication and multi-device sessions;
- final public licensing/trademark packaging.
