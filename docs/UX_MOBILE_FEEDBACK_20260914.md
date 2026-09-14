# Mobile alpha feedback — 2026-09-14

This note records UX issues observed during the first mobile test after universal external-wallet support.

Accepted changes for the next alpha lot:

- expose a confirmed `Nouvelle partie / Réinitialiser` action while a game is still open or settling; clearing a game must preserve global preferences and reusable configuration defaults;
- change the default fiat buy-in/rebuy from 20 to 10;
- center the `Non-custodial by design` badge correctly on narrow screens;
- require confirmation for the initial cash buy-in as well as cash rebuys;
- allow QR input from the phone photo library in addition to live camera scanning, because the organizer may need to import a QR displayed by a wallet on the same device;
- offer clipboard paste as another same-device path;
- keep Lightning destination classification explicit: BOLT11 invoices start with `lnbc`, `lntb` or `lnbcrt`; BOLT12 offers use `lno1`;
- add a true cross-device party-join QR flow as a separate follow-up. A QR by itself cannot mutate the organizer's browser state across devices without either a return scan or a rendezvous/relay channel, so this must not be faked as already implemented.

Generic wallet deep links such as `lightning:` are useful for opening a wallet to *pay a known request*, but there is no universal browser deep link that asks an arbitrary Lightning wallet to return its receiving address/invoice back to NOIOU. The portable same-device mechanisms are therefore clipboard paste and QR-image import; app-specific deep links may be added later as optional accelerators.
