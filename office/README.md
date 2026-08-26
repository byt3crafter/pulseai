# The office

The 3D floor at `/dashboard/floor` — its own Next app, served as its own
container, embedded in the dashboard.

**This is ours to change.** It started as
[Hermes3D](https://github.com/iamlukethedev/Hermes3D) by Luke The Dev (MIT), and
that credit is permanent — it is in `LICENSE`, on `/dashboard/about`, and it is a
licence condition, not a courtesy. But we develop it like the rest of Pulse: edit
what needs editing, delete what we don't want, add what we do. Don't preserve
upstream code you're working against, and don't keep a change small to make some
future merge easier — see "Taking things from upstream" for why that trade isn't
worth paying for. Upstream's own README is kept as `UPSTREAM-README.md`.

## Working on it

```bash
cd office && npm install     # once — heavy 3D deps, hence not installed by default
./start-dev.sh               # boots API :3000, dashboard :3001, office :3004
```

The office joins the boot as soon as `office/node_modules` exists, and drops out
if you remove them. The dashboard rewrites `/office/*` to `localhost:3004` in
development (`dashboard/next.config.ts`), standing in for the nginx rule that
does it in production — so the iframe's path is the same in both, and
`/dashboard/floor` works locally with no reverse proxy.

`npx tsc --noEmit` here is also run by the pre-commit hook whenever you stage a
`.ts`/`.tsx` under `office/`. It ships `vitest` and `playwright` too; neither is
wired into CI yet.

## How it connects to Pulse

Four seams, all marked in-source with `PULSE PATCH:` — grep for it. That marker
is a signpost to the places where our two designs meet, and where a change has
consequences outside this directory. It is not a fence.

### 1. It authenticates as whoever is looking at it
`src/app/api/runtime/custom/route.ts`

Upstream sends **no `Authorization` header at all** on the custom runtime seam:
it assumes a single-tenant orchestrator on a trusted network, and there is no
tenant concept anywhere in its codebase. Pulse is multi-tenant and derives the
tenant *from* the credential, so unpatched every request 401s — and serving those
endpoints unauthenticated instead would be a cross-tenant leak.

Rather than have someone paste a token into Studio settings (a second login, and
one shared credential for everyone), the proxy forwards the caller's dashboard
session cookie to `/api/office/token`, which mints a short-lived per-user token.
The office can only ever show the workspace of the person looking at it, and
there is nothing to configure.

`CUSTOM_RUNTIME_TOKEN` still wins if set — useful headless, or against a runtime
with no dashboard in front of it.

### 2. It connects on its own
`src/features/agents/components/GatewayConnectScreen.tsx`

Upstream opens on a chooser: pick a backend, paste a gateway URL, press Connect.
Inside Pulse all three answers are already known — backend and URL from env, the
credential from the viewer's session — so the form was asking a question it had
already been handed the answer to.

It now fires `onConnect()` once on mount when a URL is configured and nothing is
in flight. Deliberately **no retry after an error**, so a real failure still
lands on this screen with its message instead of looping, and the form stays
underneath for a deployment where nothing is configured.

### 3. It lives at `/office` on the dashboard's origin
`next.config.mjs` (`assetPrefix`), `Dockerfile` (`ARG HERMES3D_BASE_PATH`)

The office sends `X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self'`, so a
subdomain could **never** be embedded in the dashboard — and a cross-origin
browser would not send the session cookie seam 1 depends on. Same origin under a
path is the only arrangement that satisfies both.

**`assetPrefix`, not `basePath`.** `basePath` is the obvious choice and it does
not work here: the office runs behind its own custom server (`server/index.js`,
needed for the gateway WebSocket proxy), and with a basePath every API route fell
through the `/[...invalid]` catch-all and 307'd to `/office`. So the prefix
applies to assets only and the path is stripped in front — by nginx in
production, by a Next rewrite in development. The trailing slashes in
`proxy_pass http://localhost:3004/;` are what do the stripping, and are
load-bearing.

`assetPrefix` is baked in at **build** time, hence the Docker `ARG`.

### 4. Same-origin `fetch()` carries the base path
`src/app/layout.tsx`

Next prefixes links, the router and assets — but **not** `fetch()`. The office
calls its own API with root-relative paths (`/api/studio`,
`/api/runtime/custom`, ~19 of them), so under `/office` every one would land on
the dashboard at the origin root, 404, and the office would quietly fall back to
its defaults ("hermes / disconnected / 0 agents").

One inline pre-hydration `fetch` wrapper is smaller than rewriting every call
site, and unlike a sweep it cannot miss one.

## Set by env, not by code

- `HERMES3D_GATEWAY_ADAPTER_TYPE=custom`
- `HERMES3D_GATEWAY_URL` — the Pulse gateway
- `PULSE_DASHBOARD_URL` — where `/api/office/token` lives
- `HERMES3D_BASE_PATH` — `/office` in production, unset in development

## Known rough edges

- `config.get` / `config.patch` / `config.set` are unimplemented for the custom
  adapter (`src/lib/runtime/custom/provider.ts`), so the office logs one
  "Custom runtime does not support config.get" on load. Hydration catches it and
  carries on; what's lost is the model-policy snapshot, which nothing on the
  floor uses today. Implement it against Pulse whenever the floor wants it.

## Taking things from upstream

There is no merge to keep clean. If upstream ships something we want, go read
that change and port the idea:

```bash
git remote add hermes3d https://github.com/iamlukethedev/Hermes3D   # once
git fetch hermes3d
git log hermes3d/main --oneline
git show <sha>            # read it, then write our version
```

Attribution stays regardless of how far this diverges.
