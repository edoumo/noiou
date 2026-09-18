# NOIOU deployment

## Public entry points

- production application: `https://app.noiou.io`
- public website: `https://noiou.io` (`www.noiou.io` permanently redirects to the canonical host)
- `alpha.noiou.io` no longer serves the application: permanent redirect to the hors-production environment

## Topology

- host: `srv-webapps` (dedicated internal VM)
- edge: Cloudflare Tunnel, with **three isolated tunnels**: production, hors-production, website
- production stack: `noiou-prod-*` — application container on an isolated Docker network, no host port
- hors-production stack: `noiou-hp-*` — Basic Auth boundary + `X-Robots-Tag: noindex`, isolated network, isolated credentials
- website stack: `noiou-web-*` — static site and the alpha redirect container
- `noiou-alpha-app` / `noiou-alpha-cloudflared` retired (stopped, kept as rollback assets)

## Security boundary

The hors-production origin owns the private access boundary (nginx Basic Auth). The application container publishes no host port; the origin proxy is the only path in. Do not replace or bypass that boundary.

The production stack has no Basic Auth: it is the public application. The two stacks share no containers, no networks, no volumes, no environment files, no credentials, and no tunnels: a hors-production manipulation cannot alter production.

## Production invariants

1. no mock receive mode exists in production builds (development/CI only);
2. NWC connections are receive-only (`get_info`, `make_invoice`, `lookup_invoice`); outgoing capabilities are rejected;
3. per-invoice live cap of 250,000 sats per cave/rebuy;
4. no application host port is published;
5. hardened containers: read-only runtime, `no-new-privileges`, dropped capabilities;
6. hors-production never indexable: `X-Robots-Tag: noindex, nofollow, noarchive` and `robots.txt` Disallow;
7. HTTPS everywhere through Cloudflare Tunnel; HTTP redirects to HTTPS;
8. outgoing Lightning payouts are manual, in the organizer's own wallet;
9. the NWC URI/secret never leaves volatile browser memory.

## Build and deploy

From a checkout of the exact release tag:

```bash
docker compose -f deploy/docker-compose.app.yml build --pull
docker compose -f deploy/docker-compose.app.yml up -d
```

Expected health check from another container on the application network:

```bash
wget -qO- http://<application-container>/healthz
```

Expected response:

```text
ok
```

Never copy repository credentials into the image.

## Validation

1. unauthenticated request to the hors-production URL is rejected (401);
2. authenticated request loads NOIOU;
3. production URL loads NOIOU without authentication;
4. `/healthz` returns `ok` on both environments;
5. `/manifest.webmanifest` and `/sw.js` are reachable with the documented cache headers;
6. a browser reload of an SPA route still serves `index.html`;
7. application containers have no published host ports;
8. no NWC URI, wallet seed, Basic Auth password, or Cloudflare token is baked into any image;
9. NWC starts disconnected/diagnostic-only by design.

## Rollback

Rollback is infrastructure-only:

1. keep the previous application image tagged (for example `noiou-alpha-app:<previous-short-sha>`) and retag/recreate to roll back a release;
2. restore the previous origin/route configuration if a boundary change misbehaves;
3. the legacy alpha stack (`noiou-alpha-app`, `noiou-alpha-cloudflared`) is stopped, not removed: restarting it is the last-resort restore path for the old hostname;
4. never delete the hors-production stack during a production incident;
5. DNS/tunnel routes are restorable from the recorded previous state.

The application container does not own DNS, Cloudflare credentials, TLS, or any environment's credentials.
