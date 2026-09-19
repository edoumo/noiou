# Price oracle, Lightning wording & floating-control occlusion (NOIOU)

This document records the doctrine implemented by the
`feat/price-oracle-lightning-offline-ux` branch on top of the i18n base
(`bd0d863`).

## 1. Lightning receive modes — wording and permissions

Two product modes, with the labels mandated by the product owner:

| Mode | Label | Incoming collections | Outgoing settlement |
|---|---|---|---|
| `NWC_RECEIVE_ONLY` | **NWC — encaissement automatique** | NOIOU creates the Lightning requests and verifies caves/rebuy receipts automatically in the organizer's wallet | performed by the organizer from their wallet |
| `EXTERNAL_WALLET_MANUAL` | **Wallet externe — encaissement manuel** | NOIOU prepares the payment requests; the organizer verifies and confirms receipts in their wallet | performed manually by the organizer |

**NOIOU never spends for the organizer.** The application holds no spending
permission:

- allowed NWC methods: `get_info`, `make_invoice`, `lookup_invoice`;
- forbidden NWC methods: `pay_invoice`, `pay_keysend` (and the `multi_pay_*`
  variants) — a connection advertising any of them is rejected outright by
  `assertReceiveOnlyNwcMethods`.

The retired wording (“NWC réception uniquement”, “NWC automatique”,
“NWC receive-only”) is banned as a *primary label*: it may still appear in
technical copy, diagnostics and code identifiers. `receive-only` therefore
remains in `src/nwc.ts`, `src/nwcReceive.ts` and the diagnostics panel, while
every user-facing label uses the new terminology — enforced by
`src/nwcTerminology.test.ts` for all 14 public locales.

## 2. Price oracle (BTC/fiat)

`src/priceOracle.ts` is the single abstraction:

- **Providers**: `KRAKEN` (default automatic source, public Spot API, no key),
  `COINBASE` (optional, public `v2/prices`), `MANUAL`.
- **Formula**: `rate = (best bid + best ask) / 2` — the midpoint. Kraken
  exposes both; Coinbase publishes a single spot value used for both sides.
- **Metadata stored**: `provider`, `pair`, `base`, `quote`, `bid`, `ask`,
  `rate`, `retrievedAt` (+ `lockedAt`, `manual`, `manualNote` for manual).
- **Freshness**: an automatic quote must be ≤ 60 s old at creation
  (`RATE_MAX_AGE_MS`), otherwise the creation blocks and asks for a refresh
  (fail closed, never a silent manual fallback).
- **Endpoints**:
  - `https://api.kraken.com/0/public/Ticker?pair=XBTEUR` / `XBTUSD`
  - `https://api.coinbase.com/v2/prices/BTC-EUR/spot` / `BTC-USD/spot`
  Both are CORS-open for browser use (verified against the live API with an
  `Origin` header).

## 3. The lock

At creation (`src/ratePlan.ts`):

- SATS games: **no oracle at all**, no field, no call.
- EUR/USD + automatic source: the fetched midpoint is frozen into
  `game.lockedRate` and mirrored into the legacy flat `lockedBtcFiatRate`.
- EUR/USD + MANUAL: the organizer's value is frozen, flagged
  `manual: true`, optionally with a `manualNote`.

`game.lockedRate` is written exactly once, in `applyLockedRateToGame`. Changing
the preferred source in Settings afterwards only affects the **next** game: an
active game's provider, pair and rate are immutable against settings changes,
reloads, navigation and backup round-trips.

## 4. Manual is a product mode, not a hack

- MANUAL can be selected **before** any Kraken attempt: no timeout to wait for.
- A fully offline EUR/USD cash game works end-to-end with a manual rate:
  creation, players, cash caves, cash rebuys, counting, cash settlement, ledger,
  backup — with **zero network calls** (proven by `src/offlineDoctrine.test.ts`,
  which instruments `fetch` and asserts it was never called).
- NWC/Lightning, by nature, require connectivity — this is never claimed
  otherwise anywhere in the UI.

## 5. Auditability

- `PRICE_RATE_LOCKED` ledger event carries the full metadata; a manual rate is
  immediately identifiable (`provider: 'MANUAL'`, `manual: true`,
  `verifiedByMarket: false`, optional note).
- The locked rate is displayed read-only in the game summary:
  `Kraken · 97 435,12 EUR/BTC · verrouillé 22:31` or
  `Manuel · 97 000 EUR/BTC · verrouillé 22:31` + “Non vérifié par une source de
  marché”.
- Backup export includes the whole metadata; import restores the historical
  rate **exactly** and never refetches. Legacy backups that only carried
  `lockedBtcFiatRate` are imported as a documented legacy manual value
  (`provider: 'MANUAL'`, `legacy: true`).

## 6. Floating-control occlusion

`src/floatingControlsDodge.ts` protects, in addition to the historical
“primary action crossing the band” rule, every element marked with
`data-floating-safe-zone`. The zones covered by the application are:

| Zone | Surface |
|---|---|
| `rate` | rate source block (creation) + SATS note |
| `locked-rate` | locked-rate read-only summary |
| `lightning-organizer` | organizer Lightning destination block |
| `collections` | caves / rebuys and their explanations |
| `final-stacks` | chip counting |
| `settlement-control` | impartial settlement control |
| `settlement-controls` | payouts, dealer line, closure |
| `dealer-tips` | dealer tips |
| `nwc` | organizer Lightning / NWC block and mode doctrine |
| `ledger` | audit log |
| `backup` | backup & transfer |

The floating shortcuts (party join / new game) **and the collapsed settings
pill** step aside (opacity + `pointer-events: none`) while they would overlap a
protected zone, and return as soon as the overlap is gone.

A fixed control is deliberately never treated as “its own obstacle”: on a long
page that would hide it permanently and make it unreachable — the opposite of
the goal. Every mandated zone is enumerated instead.

## 7. Tests

- `src/priceOracle.test.ts` — Kraken EUR/USD, bid, ask, midpoint, offline,
  timeout, invalid JSON, invalid bid/ask, stale quote, credentials, endpoints.
- `src/ratePlan.test.ts` — plan/lock decisions, SATS, manual, stale, provider
  switching, legacy import, ledger payload.
- `src/rateLockBackup.test.ts` — anti-manipulation (settings, reload,
  export/import) for Kraken and manual games, legacy backup import.
- `src/offlineDoctrine.test.ts` — full offline cash game (EUR + USD) with zero
  network calls; Kraken offline fails closed; SATS calls nothing.
- `src/floatingControlsDodge.test.ts` — historical behaviour + safe zones +
  interactive controls + self-exclusion.
- `src/nwcTerminology.test.ts` — permission invariants + mandated wording +
  banned labels across all 15 public locales.
- `src/localeCurrency.test.ts` — locale ⇒ default currency, currency registry
  and minor units, oracle capability per currency, cash-only games for all
  seven fiat currencies with zero network calls, backups for the new
  currencies, Intl locale/currency independence.

## 8. Locale, default currency and the cash-only path

A game's **language**, its **currency** and its **rate source** are three
independent concepts. Locale never dictates what a created game is worth.

### 8.1 Default currency per locale

`src/currency.ts` holds the single table (exact region — never a naive
“Europe ⇒ EUR” rule):

| Locale | Currency | Locale | Currency | Locale | Currency |
|---|---|---|---|---|---|
| fr-FR | EUR | da-DK | DKK | hu-HU | HUF |
| en-GB | GBP | hr-HR | EUR | ja-JP | JPY |
| en-US | USD | bg-BG | EUR¹ | ko-KR | KRW |
| de-DE | EUR | el-GR | EUR | | |
| es-ES | EUR | fi-FI | EUR | | |
| it-IT | EUR | | | | |
| pt-PT | EUR | | | | |

¹ Bulgaria adopted the euro on 2026-01-01: `bg-BG` defaults to EUR, never BGN.

The mapping is a **suggestion before creation only**:

- while the organizer never picked a currency, changing the language adjusts
  the suggestion (fr-FR ⇒ EUR, then en-US ⇒ USD);
- an explicit pick is **never replaced silently** — choosing GBP and switching
  to Japanese keeps GBP;
- an explicit pick can be reverted with “Back to the language default”;
- once a game exists, `game.currency` is immutable: changing the language
  during a game never changes what is being played for.

### 8.2 Currency registry

`CURRENCY_REGISTRY` carries `code`, `labelKey`, `kind`, `minorUnits`, `symbol`
and `oracleEligible` for EUR, USD, GBP, DKK, HUF, JPY, KRW and SATS. Minor
units drive input and rounding only — `step=0.01` is never assumed globally:
EUR/USD/GBP/DKK are 2, while HUF (no fillér in circulation since 1999), JPY,
KRW and SATS are 0. Display always goes through
`Intl.NumberFormat(locale, { style: 'currency', currency })`, so it follows the
display locale's own rules.

Note on HUF: ICU builds disagree on its decimals (Node 20 renders 2, Node 22
renders 0) because ISO 4217 still defines the historical fillér. NOIOU therefore
never derives HUF's decimals from `Intl` — `minorUnits` is the single authority
for input and rounding.

### 8.3 Cash-only games need no BTC rate

A fiat game is only asked for a BTC/fiat rate when a Lightning feature actually
has to convert an amount. Declaring the game **cash-only** at creation skips
the oracle entirely — no field, no fetch, no lock — so a DKK, HUF, JPY, KRW,
GBP, EUR or USD cash game runs fully offline. The flag is stored as an optional
`game.cashOnly`, so legacy sessions and backups stay readable byte-for-byte. A
Lightning action on such a game fails with an explicit message instead of
inventing a rate.

### 8.4 Automatic-source capability

`providerSupportsCurrency(provider, currency)` answers from one table, verified
against the live public APIs on 2026-09-19:

| Pair | Kraken | Coinbase |
|---|---|---|
| BTC/EUR, BTC/USD, BTC/GBP | ✅ | ✅ |
| BTC/JPY | ✅ | ❌² |
| BTC/DKK, BTC/HUF, BTC/KRW | ❌ | ✅ |

² Coinbase's `BTC-JPY` spot answered a flat `35,600,000` while its own
`exchange-rates` feed said `12,755,776` and Kraken's midpoint sat at
`12,737,924` — a 2.8× inconsistency, so JPY is deliberately marked unsupported
there rather than serving a wrong price.

When no automatic source publishes the pair, the UI says so plainly (“No
automatic source available for BTC/{quote}”) and offers the explicit manual
rate. A cross rate (BTC/EUR × EUR/DKK) is **never** derived silently.

