# Metcheck — go-live checklist

The gate before the client relies on the agent. Every box is a real path driven
once, for real — not "looks right." The agent has ERPNext write, email send, and
server access, so the safety controls must be proven, not assumed.

## Security posture (this agent is high-privilege)

- [ ] **Tool Policy = read-free / write-gated.** On the agent's Tool Policy:
      - Ungated (read): ERPNext reads, `email_read`/`email_fetch_unread`/`email_search`, SSH **observe** mode.
      - `ask` (approval required): `email_send`, `email_reply`, any ERPNext write tool, `server_exec` writes.
- [ ] **Servers assigned in `safe` mode, not `full`,** for the first weeks. Confirm the SSH command policy blocks destructive commands (the audit hardened `find -exec`, `rm -rf //`, `/*`, newline injection — verify a couple are still rejected on the client box).
- [ ] **Approvers set** in People, each with a Telegram identity, so cards reach a human.
- [ ] Postgres/Redis are internal only (`docker compose ps` shows no host ports for them).
- [ ] Admin default password changed. No other admin accounts leaked.
- [ ] `enable_third_party_cli` only on if they actually use a CLI integration.

## Real-path verification (drive each once)

- [ ] **Email approve→send:** agent drafts a reply → approval card appears (Telegram AND `/dashboard/approvals`) → **Allow → the real email actually sends** to a test address. (This is the path never fully clicked in dev — do it here.)
- [ ] **Email deny:** Deny → nothing sends.
- [ ] **ERPNext read:** agent answers a question using real Metcheck ERPNext data.
- [ ] **ERPNext write (if enabled):** gated → approved → the record actually changes.
- [ ] **Server observe:** an observe-mode command returns real output; a write command is either blocked (observe) or gated (safe).
- [ ] **Schedule:** create the agent's cron (e.g. inbox check) → confirm it fires without a restart (30s reconcile).

## Reliability

- [ ] Backups running (check a dump file exists tomorrow) and restorable.
- [ ] `ENCRYPTION_KEY` backed up off-box.
- [ ] Watchdog restarts a killed container.
- [ ] **Silent-failure guard:** simulate a bad/expired LLM key → confirm the agent surfaces an error (to the user or an alert), not silence. *(Known product gap — if it fails silently, note it and prioritize an alert before heavy reliance.)*

## Client experience

- [ ] Dashboard shows **Metcheck** branding, not "Runstate".
- [ ] Approval card text is correct (fix the "expires in 2 minutes" line — real TTL is 2h for tool calls).
- [ ] Docs at `/dashboard/docs` reachable; setup pages accurate for their config.
- [ ] Onboarding/first-run for the client admin is sane.

## Sign-off

- [ ] You + a Metcheck user run it live for N days.
- [ ] Issues logged, triaged, fixed on `main` (→ merged into `customer/metcheck`).
