# Regulatory design boundaries

This document is an engineering constraint record, not legal advice.

## Objective

Design NOIOU so the software does not need to custody user funds or operate a shared wallet. The application should act as accounting/coordination software around a physical game, while the organizer remains the holder of cash and of any Lightning wallet used by the game.

## Required architecture

NOIOU must not:

- hold a seed or private key belonging to a user;
- operate an omnibus wallet for game funds;
- maintain withdrawable crypto balances on behalf of players;
- receive player funds into an operator-controlled wallet before forwarding them;
- provide exchange/swap/bridge services;
- take a rake or hidden percentage from the pot;
- autonomously move user funds from a hosted backend without explicit design/legal review.

## Preferred payment model

### Cash

Cash is physically handed to and held by the game organizer. NOIOU records a human confirmation that the money was received.

### Lightning

A future real integration should connect to a wallet controlled by the organizer. Wallet permissions must be minimal. Connection/spending secrets should remain on the organizer device whenever technically feasible.

Outgoing settlement should be prepared by NOIOU and explicitly approved by the wallet/user unless a later legal and security review approves a narrower automated capability.

## Project donations

Voluntary donations to the NOIOU project are a distinct transaction for the project's own account. They must never be mixed into pot accounting or deducted automatically from player funds.

## Review gate

Before public/commercial use, and again before adding any of the following, perform a dedicated legal/regulatory review:

- real NWC outgoing payment capability;
- hosted wallet connectivity;
- custody/escrow;
- swaps or stablecoins;
- automatic crypto transfer on behalf of users;
- any mandatory fee linked to stakes, pots or winnings.

Documentation must not claim a MiCA exemption. The repository may state only that the system is designed to be non-custodial and to minimize regulated-service exposure.
