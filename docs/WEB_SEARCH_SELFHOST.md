# Self-Hosted Web Search (SearXNG + Firecrawl)

Optional, opt-in overlay that gives any Pulse deployment its own web search
and page-scrape backend instead of depending on a paid third-party API. Not
tied to any specific client — every deployment enables it the same way.

## What this adds

| Service | Role | Internal URL |
|---|---|---|
| **SearXNG** | Metasearch engine — aggregates DuckDuckGo, Bing, Brave, Wikipedia and returns JSON results | `http://searxng:8080` |
| **Firecrawl** | Scrapes/extracts a given URL into clean markdown/text; also does its own search via SearXNG | `http://firecrawl-api:3002` |

Firecrawl also brings up three internal support services it depends on:
`firecrawl-playwright` (headless rendering), `firecrawl-rabbitmq` (job queue
transport), and `firecrawl-nuq-postgres` (job queue state — a dedicated
Postgres, separate from Pulse's own database).

**Everything is internal-only.** Every service is declared with `expose:`,
never `ports:`, so nothing here is reachable from outside the docker network.
The only thing that can call SearXNG or Firecrawl is `pulse-gateway`, over the
compose network.

## Resource expectations

Rough steady-state memory, on top of the base Pulse stack:

| Service | Memory |
|---|---|
| SearXNG | ~150 MB |
| Firecrawl (api + playwright + rabbitmq + postgres) | ~1.5–2 GB |

Give the host at least 2–3 GB of free RAM before enabling this overlay.
Playwright's rendering is the heaviest part — expect brief CPU spikes while a
page is being scraped.

## Bringing it up

```bash
./scripts/enable-search.sh
```

This generates the required secrets into `.env` (if not already present),
starts the overlay, and reports whether `pulse-gateway` can reach both
services.

Equivalent manual command:

```bash
docker compose -f docker-compose.yml -f docker-compose.search.yml up -d
```

### Required `.env` values

Generated automatically by `enable-search.sh`; if setting up by hand, see the
"Self-hosted web search" block in `.env.example`:

- `SEARXNG_SECRET` — SearXNG's session secret (`openssl rand -hex 32`)
- `FIRECRAWL_BULL_AUTH_KEY` — protects Firecrawl's internal queue admin UI (`openssl rand -hex 32`)
- `FIRECRAWL_POSTGRES_PASSWORD` — password for Firecrawl's dedicated queue Postgres (`openssl rand -hex 16`)

`REDIS_PASSWORD` must already be set (the base stack requires it) — both
SearXNG and Firecrawl reuse the existing Redis instance on their own logical
DB indexes (2 and 3) rather than running a second Redis.

## Pointing Pulse at it

**Admin → Web Search:**

- SearXNG URL: `http://searxng:8080`
- Firecrawl URL: `http://firecrawl-api:3002`

These are the defaults the app expects when this overlay is running, so in
most cases you only need to toggle the feature on per-tenant/per-agent — the
URLs above should already be filled in.

## Troubleshooting

- **Web search returns nothing / "unexpected response" from SearXNG.**
  SearXNG must have JSON output enabled. Check `searxng/settings.yml` has:
  ```yaml
  search:
    formats:
      - html
      - json
  ```
  Without `json` in that list, SearXNG returns 403 for
  `?format=json` requests even though the HTML web UI keeps working — this is
  the most common cause of "search works in the browser but not from Pulse."

- **SearXNG container won't start / permission errors on `searxng/`.**
  The container runs as its own `searxng` user and needs to write to the
  mounted `./searxng` directory. If you see ownership warnings in
  `docker compose logs searxng`, run `sudo chown -R 977:977 searxng/` (or
  whatever UID the image logs) on the host.

- **Firecrawl scrape requests time out.** Check
  `docker compose logs firecrawl-playwright` — most failures are the
  rendering service still warming up (Chromium cold start) or the target site
  actively blocking headless browsers. Retry once before assuming it's broken.

- **Firecrawl API container restarts in a loop (`api ... Killed`, exit 137).**
  This is the cgroup OOM-killer. Firecrawl's harness runs ~10 Node processes in
  the one `firecrawl-api` container (the API plus five NuQ workers plus
  prefetch/reconciler/extract). At startup they collectively spike well past
  2.5 GB, so the API process gets killed. Firecrawl therefore needs **~3–4 GB
  of headroom of its own** — do NOT run it on a box that doesn't have that free
  *on top of* the base stack (~2.7 GB) without pushing the whole machine into
  OOM. On a tight box, either give `firecrawl-api` a higher `deploy.resources.
  limits.memory` (only if the host truly has the RAM — never let it starve the
  live gateway/dashboard) or skip Firecrawl entirely and set the page-reading
  backend to **Basic** in Admin → Web Search. The built-in Basic fetcher needs
  no extra services and returns clean text; you lose Firecrawl's richer markdown
  extraction but keep working `web_fetch`. SearXNG search is unaffected either
  way and is the cheap, high-value half of this stack (~150 MB).

- **Firecrawl API container restarts in a loop (other causes).** Check
  `docker compose logs firecrawl-nuq-postgres` and `firecrawl-rabbitmq` first
  — the API's harness process needs both healthy before it will come up. Note:
  the NuQ Postgres image must run as its **default `postgres` database** (its
  `pg_cron` init only works there); do not set `POSTGRES_DB`/`POSTGRES_USER` on
  that service.

- **Checking things are reachable at all.** Since nothing is published to the
  host, `curl localhost:8080` from your laptop will never work — that's
  expected. Test from inside the network instead:
  ```bash
  docker exec pulse-gateway node -e "fetch('http://searxng:8080/healthz').then(r=>r.text()).then(console.log)"
  docker exec pulse-gateway node -e "fetch('http://firecrawl-api:3002/').then(r=>console.log(r.status))"
  ```

## Turning it off

```bash
docker compose -f docker-compose.yml -f docker-compose.search.yml down
```

This stops the five containers and leaves `docker-compose.yml`'s own services
untouched. Volumes (`pulse-searxng-cache`, `pulse-firecrawl-db-data`) persist
until you `docker volume rm` them explicitly.
