# NOIOU V1.0.0-rc1 — status

```
status=RC1_FROZEN
tag=v1.0.0-rc1
commit=ebce45af9e95668c379ed744c0739de785bcfc52
vm=126
tests=145/145 PASS
health=PASS
rollback=READY
mainnet_receive_test=PENDING
outbound_lightning=DISABLED
```

## Freeze facts

- Tag `v1.0.0-rc1` (annotated) points exactly at
  `ebce45af9e95668c379ed744c0739de785bcfc52`, the merge commit of the UX27
  readiness work (PR #32). Verified locally and on `origin`.
- No application code changes are allowed in RC1 without a new candidate.
  Documentation may be added after the freeze without moving the tag.
- CI on the RC1 commit: `quality` workflow = success (production dependency
  audit, strict typecheck, 145 tests, application build, hardened Docker
  container smoke test).
- Deployed on VM126 (`noiou-alpha-app`, image digest recorded in the release
  evidence bundle), healthy, no host ports published.
- Rollback image: `noiou-alpha-app:926fa4c-rollback-ux27` (previous UX26-F1
  build `af3cbe8e1721`); rollback source tree: `/opt/noiou-src.old-ux27`.

## Production gate

> RC1 is functionally validated. Before any real-funds production use, a
> controlled mainnet Lightning receive test must be completed.

The mainnet receive test validates the real boundary: funding wallet →
Lightning mainnet → receive-only NWC wallet → NOIOU invoice detection → PAID
state → audit ledger → persistence. It requires a human-authorized real
payment of a minimal amount and is tracked as `mainnet_receive_test=PENDING`
until performed.

Final V1 (`v1.0.0`) will only be tagged after that test passes and an explicit
promotion decision.

## Evidence

- UX27 readiness: `/home/edou/qa-artifacts/noiou/alpha-deploy/ux27-prod-readiness-evidence.tar.gz`
  (sha256 `d3c529a7f34c61d51cc9127be99c517312beb64824f72a052f12ef0fb3081423`)
- RC1 evidence bundle: `/home/edou/qa-artifacts/noiou/release/noiou-v1.0.0-rc1-evidence.tar.gz`
