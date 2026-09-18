# NOIOU V1.0.0-rc1 — status (historical)

```
status=RC1_FROZEN
tag=v1.0.0-rc1
commit=ebce45af9e95668c379ed744c0739de785bcfc52
tests=145/145 PASS
health=PASS
rollback=READY
mainnet_receive_test=COMPLETED (PASS, 2026-09-18)
outbound_lightning=DISABLED
```

## Freeze facts

- Tag `v1.0.0-rc1` (annotated) points exactly at
  `ebce45af9e95668c379ed744c0739de785bcfc52`, the merge commit of the UX27
  readiness work (PR #32). Verified locally and on `origin`.
- No application code changes were allowed in RC1 without a new candidate.
- CI on the RC1 commit: `quality` workflow = success (production dependency
  audit, strict typecheck, 145 tests, application build, hardened Docker
  container smoke test).
- Deployed healthy with no host ports published.
- Rollback image and previous source tree were preserved.

## Production gate

> RC1 is functionally validated. Before any real-funds production use, a
> controlled mainnet Lightning receive test must be completed.

The controlled mainnet receive test was completed: a real 5000-sat payment
settled (`completedAt` recorded), the preimage was verified against the
payment hash, NOIOU flipped the contribution to `PAID`, the audit ledger
stayed valid, and the state survived reload and container restart
(`mainnet_receive_test=PASS`, 2026-09-18).

On this basis the validated code was promoted to `v1.0.0` (same commit
`ebce45af9e95668c379ed744c0739de785bcfc52`).

## Evidence

- UX27 readiness evidence bundle and RC1 evidence bundle are kept with the
  release operations records (not distributed in this repository).
