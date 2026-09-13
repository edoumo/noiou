# NOIOU private alpha deployment

Target prepared by the infrastructure handoff:

- public URL: `https://alpha.noiou.io`
- host: VM126 `srv-webapps` (`192.168.1.198`)
- Cloudflare Tunnel: `noiou-alpha`
- existing private edge container: `noiou-alpha-origin`
- stack directory: `/opt/noiou-alpha`
- Docker network: `noiou-alpha-net`
- no host port should be published for the application container

## Security boundary

The existing `noiou-alpha-origin` container owns the private access boundary (currently nginx Basic Auth). **Do not replace or bypass that boundary when deploying the app.**

The NOIOU application container is a separate static nginx container named `noiou-alpha-app` on the same internal Docker network. The origin nginx should keep its existing authentication and proxy authenticated requests to:

```nginx
proxy_pass http://noiou-alpha-app:80;
```

Only the authenticated origin is reachable through the Cloudflare Tunnel. `noiou-alpha-app` exposes no host port.

## Build and start on VM126

Use a private checkout of `edoumo/noiou` on VM126 or an equivalent trusted build workspace. Never copy repository credentials into the image.

From the repository root:

```bash
docker compose -f deploy/docker-compose.app.yml build --pull
docker compose -f deploy/docker-compose.app.yml up -d
```

Expected health check from another container on `noiou-alpha-net`:

```bash
wget -qO- http://noiou-alpha-app/healthz
```

Expected response:

```text
ok
```

## Existing origin change

Preserve the current Basic Auth directives and Cloudflare Tunnel route. Replace only the placeholder/static upstream behavior so authenticated requests are proxied to `noiou-alpha-app:80`.

Do not publish port 80/443 from `noiou-alpha-app` to VM126. Do not move Basic Auth into the app image. The access layer is infrastructure and must remain independently replaceable by Cloudflare Access later.

After changing the origin configuration, validate it before reload, then reload nginx without recreating credentials.

## Validation

Validate all of the following:

1. unauthenticated request to `https://alpha.noiou.io` is rejected;
2. authenticated request loads NOIOU;
3. `/manifest.webmanifest` is reachable after authentication;
4. `/sw.js` is reachable with no-cache headers;
5. browser reload of an SPA route still serves `index.html`;
6. `noiou-alpha-app` has no published host ports;
7. repository remains private;
8. no NWC URI, wallet seed, mailbox password, Basic Auth password, Cloudflare token, or other secret is baked into the image;
9. NWC starts disconnected/diagnostic-only as designed;
10. browser local session persistence works across a normal page reload.

## Rollback

Rollback is infrastructure-only:

1. restore the previous `noiou-alpha-origin` nginx configuration;
2. reload the origin nginx;
3. stop/remove `noiou-alpha-app` if necessary;
4. keep the Cloudflare Tunnel and Basic Auth credentials unchanged.

The application container does not own DNS, Cloudflare credentials, mail configuration, TLS certificates, or the Basic Auth secret.
