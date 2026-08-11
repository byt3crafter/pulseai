# Metcheck (Botswana) — customer deployment

This branch (`customer/metcheck`) carries everything specific to the **Metcheck**
client deployment. It is a **thin, downstream branch of `main`**.

## Branch discipline (read this first)

```
main  ───────────●────────────●────────────●──────►   (product trunk)
                  \            \            \
customer/metcheck  ●─(merge)───●─(merge)────●──►       (Metcheck-only work + merges from main)
```

- **General fixes & features → `main`.** Bug fixes, hardening, new capability —
  all land on `main` as normal, then flow DOWN to this branch:
  ```bash
  git checkout customer/metcheck
  git merge main            # pull in every fix; resolve any conflict here
  ```
- **Metcheck-only work → this branch.** Their branding, deployment config,
  a custom plugin/integration built just for them, this `docs/customers/metcheck/`
  folder. These do NOT go back to `main`.
- **If a "Metcheck feature" turns out useful for everyone** (e.g. config-driven
  branding), promote it to `main` instead of keeping it here — the goal is to
  keep this branch as small as possible so merges stay painless.
- **Never merge `customer/metcheck` INTO `main`.** The flow is one-directional.

## Deploy target

- **Dedicated deployment** (own VPS + domain), NOT a tenant on the Runstate box.
- The client is the tenant (single-client-per-deployment model).

## Files here

- `DEPLOYMENT.md` — step-by-step to stand up the Metcheck box from bare metal.
- `GO-LIVE-CHECKLIST.md` — the hardening/verification gate before the client relies on it.
- `INTEGRATIONS.md` — inventory of everything we need FROM Metcheck to configure it.

## Status

- [ ] Server + domain provisioned
- [ ] Stack deployed + HTTPS
- [ ] Backups configured
- [ ] Silent-failure alerting
- [ ] Client tenant + integrations connected
- [ ] Agent built + Tool Policy (read-free / write-gated)
- [ ] Branding applied
- [ ] Go-live checklist passed
- [ ] Pilot started
