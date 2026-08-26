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

`next.config.ts` (`basePath`) and `Dockerfile` (`ARG HERMES3D_BASE_PATH`)

Hermes3D sends `X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self'`, so a
subdomain could **never** be embedded in the dashboard — and a cross-origin
browser would not send the session cookie the patch above depends on. Same
origin under a path is the only arrangement that satisfies both.

`basePath` also namespaces its assets to `/office/_next/…`, which is what stops
them colliding with the dashboard's own `/_next/`.

Note `basePath` is baked in at **build** time, hence the Docker `ARG`.

## Not patched (configured by env, upstream already supports it)

- `HERMES3D_GATEWAY_ADAPTER_TYPE=custom`
- `HERMES3D_GATEWAY_URL=<pulse gateway>`

## Re-syncing upstream

```bash
git remote add hermes3d https://github.com/iamlukethedev/Hermes3D   # once
git fetch hermes3d
# diff office/ against the new upstream, re-apply the two PULSE PATCH hunks
```
