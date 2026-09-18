# Alpha deployment (historical)

`alpha.noiou.io` was the original private alpha hostname (authenticated origin + Cloudflare Tunnel). It no longer serves the application.

Current state:

- `alpha.noiou.io` permanently redirects to the hors-production environment;
- the hors-production environment is a separate, isolated stack protected by Basic Auth (`noindex`, `nofollow`, `noarchive`) used for release validation;
- current deployment instructions and invariants are documented in [DEPLOYMENT.md](DEPLOYMENT.md).

## Historical invariants (still relevant)

- the application container publishes no host port; the edge proxy is the only path in;
- Basic Auth belongs to the edge layer, never inside the application image;
- no NWC URI, wallet seed, environment password, or edge token is baked into any image;
- `noiou-alpha-app` / `noiou-alpha-cloudflared` are retired and kept stopped as rollback assets for the legacy hostname.
