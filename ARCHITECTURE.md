# Architecture

## Goal

NOIOU is a local-first PWA for tracking money around a physical poker table. It is not an online poker product and must not custody player funds.

## Initial shape

- React + TypeScript PWA client.
- Domain logic kept framework-independent.
- `LightningAdapter` boundary isolates wallet integrations from settlement logic.
- `MockLightningAdapter` is the only adapter required during bootstrap.
- Persistence/backend are intentionally deferred until the local domain model and invariants are stable.

## Non-custodial boundary

NOIOU must never require or store a wallet seed or private key. Future NWC integration should use the minimum capabilities required and keep spending credentials on the organizer's device whenever feasible. A hosted backend must not become an omnibus wallet or maintain crypto balances for users.

## Accounting boundaries

Three flows are distinct:

1. Player pot: paid buy-ins/rebuys and player payouts.
2. Dealer compensation: explicit rule configured for the game.
3. Project donations: voluntary, separate from the game ledger, never deducted silently from player funds.

## Settlement gate

A settlement is blocked unless total final chips exactly equal total chips issued from paid contributions. Unpaid or pending contributions do not issue chips.

## Deferred decisions

- durable storage and sync model;
- NWC adapter details;
- optional LNbits self-hosted adapter;
- fiat/BTC rate provider and rate-lock semantics;
- cryptographic append-only event ledger;
- authentication and multi-device sessions.
