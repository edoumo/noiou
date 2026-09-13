# NOIOU V1 scope

## Product statement

NOIOU is a settlement companion for physical poker games. Cards, chips, dealing, rules and play remain entirely physical. NOIOU tracks only the money/accounting side of the evening.

## In scope

- reference currency: EUR, USD or SATS;
- fixed buy-in and rebuy amount per game;
- physical cash confirmation;
- Bitcoin Lightning through an adapter boundary;
- private bootstrap uses mock Lightning only;
- optional dealer compensation configured before the game;
- player pseudonyms without civil identity/KYC requirements in the product model;
- physical final-chip count;
- strict reconciliation between issued and counted chips;
- final player settlement and explicit confirmation;
- optional voluntary project donations, always outside the pot;
- tamper-evident append-only event ledger;
- mobile-first web/PWA UX.

## Foundational rules

- no chips are considered issued until the corresponding contribution is paid;
- no unpaid promise such as "I will pay tomorrow" counts as a buy-in;
- pending contributions block transition to settlement;
- settlement cannot proceed with an unbalanced chip count;
- outgoing payments are not silently automated;
- the game cannot close while a required payout remains unconfirmed;
- NOIOU takes zero rake and has no hidden fees;
- donations are voluntary and separate from game accounting.

## Explicitly out of scope

- online poker gameplay;
- card dealing, RNG, tables or matchmaking;
- custody/escrow operated by NOIOU;
- exchange or crypto swaps;
- USDC/USDT/other token support;
- bank cards or bank accounts;
- KYC;
- project advertising/monetization beyond future voluntary donations;
- public deployment during private incubation.
