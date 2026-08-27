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

Marked in-source with `PULSE PATCH:` — grep for it. The marker means "changing
this has consequences outside this directory". It is not a fence.

**The rule underneath all of it: Pulse env is authoritative, everywhere, always.**
Nothing a browser sends, nothing a file remembers, and nothing a user clicks can
move a deployment off its own workspace. The office used to be a Hermes client
that *became* a Pulse client if a network request succeeded — that is what broke,
and every seam below exists so it can never be true again.

### 1. One resolver owns the runtime
`src/lib/office/pulse-runtime.ts`

`resolvePulseRuntime()` is the single reader of `HERMES3D_GATEWAY_URL`, and the
adapter type is a constant. `HERMES3D_GATEWAY_ADAPTER_TYPE` is deliberately not
read: it let a deployment ask for `hermes`, and its absent-value default was
`"hermes"` too, so a Pulse box could boot pointed at a runtime that was not
running.

`readPulseRuntime()` is its browser half — see seam 2.

### 2. The browser is told the runtime in the HTML
`src/app/layout.tsx` (`force-dynamic` + a `window.__PULSE_RUNTIME__` stamp)

`process.env` is server-only, so without this the browser's opening belief was
the upstream default: Hermes on `ws://localhost:18789`. That is what the badge
renders, and the only thing that could correct it was a `/api/studio` fetch with
no timeout, no retry, and a fallback to *hermes* rather than to env. On a slow
link it never landed and the office sat on "Connecting to your runtime…" forever.

`force-dynamic` is load-bearing: without it Next prerenders these routes and
bakes env at **build** time, where the gateway URL does not exist because
docker-compose sets it at **run** time.

Stamped in the root layout, not threaded as a prop, so every route gets it and a
new route cannot be added without it.

### 3. Nothing user-facing waits on the network
`src/lib/gateway/GatewayClient.ts`

Initial state is seeded from the runtime, `settingsLoaded` starts true under
Pulse, and `"custom"` is in `isAutoManagedAdapter` — it was excluded, which
barred Pulse from every automatic connect and retry path in the file. The
`/api/studio` fetch is now only a hydration detail, and `src/lib/http.ts` gives
every request a default timeout.

### 4. It authenticates as whoever is looking at it
`src/app/api/runtime/custom/route.ts`

Upstream sends **no `Authorization` header at all** here: it assumes a
single-tenant orchestrator on a trusted network, and has no tenant concept
anywhere. Pulse derives the tenant *from* the credential, so unpatched every
request 401s — and serving these endpoints unauthenticated instead would be a
cross-tenant leak.

Rather than have someone paste a token into settings (a second login, and one
shared credential for everyone), the proxy forwards the caller's dashboard
session cookie to `/api/office/token`, which mints a short-lived per-user token.
The office can only ever show the workspace of the person looking at it.

The same route also ignores the client-supplied `runtimeUrl` and uses env: the
browser used to name the target and the server merely allowlisted its hostname.
The allowlist still applies to a browser-supplied URL, and is skipped for the
operator's own env value — checking that against a list the same operator writes
is circular, and with no `CUSTOM_RUNTIME_ALLOWLIST` set it rejects in production.

`CUSTOM_RUNTIME_TOKEN` still wins if set — useful headless.

### 5. The runtime cannot be rewritten from outside
`src/lib/studio/settings-store.ts`, `src/app/api/studio/route.ts`

Env overwrites `gateway` on load. It used to be the reverse — once
`settings.json` held a URL, the persisted url *and* adapterType won and env
donated only the token — so one bad write pinned the deployment and env could not
argue. `/api/studio` also drops `gateway` from any PUT: that route has no auth on
either verb and is internet-reachable through the dashboard's origin, so an
unauthenticated request could otherwise repoint every viewer's office.

### 6. There is nothing to choose
`OfficeScreen.tsx`, `AgentsPageScreen.tsx`, `panels/SettingsPanel.tsx`,
`features/onboarding/*`

Four surfaces offered a backend picker, and each one could strand a user:

- the connect screen (`shouldPromptForConnect` is hard-false under Pulse),
- the agents screen's own copy, which `didAttemptGatewayConnect` alone was enough
  to show — one failed connect dropped you onto a gateway URL form,
- an always-reachable Gateway block in the in-office settings panel, where one
  tap on "Hermes" rewrote the **shared** server-side settings and disconnected
  everyone,
- a `skippable: false` "Connect Your Gateway" onboarding step, shown to every
  browser missing a localStorage flag — i.e. every first-time phone.

All gone. A failure shows a named error with a retry, never a form.

### 7. It sees work it did not start
`src/lib/gateway/pulseEventStream.ts`, `src/app/api/runtime/custom/events/route.ts`,
`GatewayClient.emitLocalEvent`, and `/events` on the Pulse gateway

Upstream's design (their `ARCHITECTURE.md`, "Agent runtime flow") is that the
gateway pushes runtime **events** and both the agents UI and the office derive
all their state from that one stream. We had implemented only the
request/response half of the contract — `/health`, `/state`, `/registry`,
`/v1/chat/completions` — and none of the streaming half.

The consequence was not subtle: `connect()` for this adapter is a `/health`
probe and returns without opening a socket, so `onEvent` could never fire, and
neither `/state` nor `agents.list` carries a status field. The only writer of
"running" was the office's own outgoing chat. Give an agent a job from the
dashboard, Telegram, a schedule or a commitment and the floor sat at
"0 working" for the whole run.

Pulse already emitted every run into its floor bus regardless of trigger, and
nothing was listening. `/events` serves that as SSE — tenant from the API token,
translated into the frames the office already parses (`agent`/`lifecycle` for
start/end/error, `office.speech` for tool captions). Frames enter through
`emitLocalEvent`, so the existing animation, run log and approval metrics work
unchanged and learn nothing about Pulse.

Two things that are easy to get wrong here:

- **The stream opens with a snapshot of runs already in flight.** A pure event
  stream can only describe the future; without it an agent already working when
  you open the floor looks idle until it finishes.
- **`X-Accel-Buffering: no` is required.** nginx buffers SSE by default, which
  holds every frame until the response ends — i.e. forever.

The translation lives in `floorEventToFrames` (`pulse/src/gateway/routes/hermes3d.ts`),
pure and tested on purpose: it has to stay in step with the office's
`normalizeGatewayEvent`, and if it drifts the failure is silent — frames keep
arriving, they just stop meaning anything.

Caption timing: `addToolCall` fires when a tool RETURNS, so a speech bubble
describes what the agent just did, not what it is doing this instant.

### 7. Assets live under `/office` on the dashboard's origin
`next.config.mjs` (`assetPrefix`), `Dockerfile` (`ARG HERMES3D_BASE_PATH`),
`src/app/layout.tsx` (a `fetch` prefix wrapper)

The office sends `X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self'`, so a
subdomain could never be embedded — and a cross-origin browser would not send the
cookie seam 4 depends on. Same origin under a path satisfies both.

**`assetPrefix`, not `basePath`.** `basePath` is the obvious choice and does not
work here: the office runs behind its own custom server (`server/index.js`, for
the gateway WebSocket proxy), and with a basePath every API route fell through
the `/[...invalid]` catch-all and 307'd. So the prefix applies to assets only and
the path is stripped in front — nginx in production, a Next rewrite in
development. The trailing slashes in `proxy_pass http://localhost:3004/;` do the
stripping and are load-bearing.

Next also does not prefix `fetch()`, and the office calls its own API with
root-relative paths (~19 of them), so a pre-hydration wrapper in `layout.tsx`
adds the prefix. Smaller than rewriting every call site, and it cannot miss one.

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

- `StudioGatewayAdapterType` still admits `demo | hermes | hermes-agent | local |
  hermes3d | custom`. Every path to those is closed, but the states remain
  *representable* — narrowing the union to `"custom"` and letting the compiler
  delete `src/lib/runtime/{demo,hermes}/*` and the two adapter scripts in
  `server/` would make it impossible rather than merely unreachable. Mechanical,
  and worth doing.

- The scene is heavy on a slow link: ~1.09 MB of blocking JS/CSS, a 1.2 MB
  uncompressed HDR (`src/features/retro-office/systems/atmosphere.tsx`), and 17
  GLBs preloaded at module scope (`objects/furniture.tsx`). Agents take ~40 s to
  appear on a degraded connection — correct, but slow.

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
