# Pulse patches to Hermes3D

Vendored from **https://github.com/iamlukethedev/Hermes3D** (MIT, © LukeTheDev).
Upstream is actively developed; keep these patches small and re-appliable.

Everything we change is marked in-source with `PULSE PATCH:` — grep for it.

## 1. Authenticate as the signed-in Pulse user

`src/app/api/runtime/custom/route.ts`

Upstream sends **no `Authorization` header at all** on the custom runtime seam:
it assumes a single-tenant orchestrator on a trusted network, and there is no
tenant concept anywhere in the codebase. Pulse is multi-tenant and derives the
tenant *from* the credential, so unpatched every request 401s — and serving
those endpoints unauthenticated instead would be a cross-tenant leak.

Rather than have someone paste a token into Studio settings (a second login,
and one shared credential for everyone), the proxy forwards the caller's
dashboard session cookie to `/api/office/token`, which mints a short-lived
per-user token. The office can only ever show the workspace of the person
looking at it, and there is nothing to configure.

`CUSTOM_RUNTIME_TOKEN` still wins if set — useful headless or against a runtime
with no dashboard in front of it.

## 2. Serve under `/office` on the same origin

`next.config.mjs` (`assetPrefix`) and `Dockerfile` (`ARG HERMES3D_BASE_PATH`)

Hermes3D sends `X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self'`, so a
subdomain could **never** be embedded in the dashboard — and a cross-origin
browser would not send the session cookie the patch above depends on. Same
origin under a path is the only arrangement that satisfies both.

**`assetPrefix`, not `basePath`.** `basePath` is the obvious choice and it does
not work here: Hermes3D runs behind its own custom server (`server/index.js`,
needed for the gateway WebSocket proxy), and with a basePath every API route
fell through to the `/[...invalid]` catch-all and 307'd to `/office`. So the
prefix is applied to assets only, and nginx strips the path instead — the
trailing slashes in `proxy_pass http://localhost:3004/` are what do the
stripping, and are load-bearing.

`assetPrefix` is baked in at **build** time, hence the Docker `ARG`.

## 3. Prefix same-origin `fetch()` with the base path

`src/app/layout.tsx`

Next prefixes links, the router and assets — but **not** `fetch()`. The office
calls its own API with root-relative paths (`/api/studio`, `/api/runtime/custom`,
~19 of them), so under `/office` every one would land on the Pulse dashboard at
the origin root, 404, and the office would silently fall back to its defaults
("hermes / disconnected / 0 agents").

One inline pre-hydration `fetch` wrapper is far smaller than rewriting every
call site, and unlike a sweep it cannot miss one.

## 4. Connect automatically

`src/features/agents/components/GatewayConnectScreen.tsx`

Upstream opens on a chooser: pick a backend, paste a gateway URL, press Connect.
Inside Pulse all three answers are already known — the backend and URL come from
env, the credential from the viewer's session (patch 1) — so the form was asking
a question it had already been given the answer to.

The screen now fires `onConnect()` once on mount when a URL is configured and
nothing is in flight. It deliberately does **not** retry after an error, so a
real failure still lands on this screen with its message instead of looping, and
the form stays underneath for a deployment where nothing is configured.

## 5. ESM config

`next.config.mjs`

Ported from upstream's `next.config.ts`: Next auto-installs TypeScript on boot
to read a `.ts` config, which crash-looped the container. `__dirname` does not
exist in ESM, so it is derived from `import.meta.url`.

## Not patched (configured by env, upstream already supports it)

- `HERMES3D_GATEWAY_ADAPTER_TYPE=custom`
- `HERMES3D_GATEWAY_URL=<pulse gateway>`

## Known upstream limits

- `config.get` / `config.patch` / `config.set` are unimplemented for the custom
  adapter upstream (`src/lib/runtime/custom/provider.ts`), so the office logs
  one "Custom runtime does not support config.get" error on load. Hydration
  already catches it and carries on; the cost is the model-policy snapshot,
  which nothing on the floor uses today.

## Re-syncing upstream

```bash
git remote add hermes3d https://github.com/iamlukethedev/Hermes3D   # once
git fetch hermes3d
# diff office/ against the new upstream, re-apply the two PULSE PATCH hunks
```
