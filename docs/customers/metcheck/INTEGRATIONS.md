# Metcheck — integration inventory (what we need FROM the client)

Fill this in as Metcheck provides each item. **Secrets never go in this file or
the repo** — they're entered in the dashboard (encrypted at rest) or the box's
`.env`. This is a checklist of what's needed, not where to store it.

## Infrastructure
- [ ] VPS: provider, IP, specs, root/SSH access — _____
- [ ] Domain / subdomain for the dashboard — _____
- [ ] DNS A record → VPS IP set — _____

## AI backend (mixed: Codex + API, per the plan)
- [ ] Metcheck ChatGPT account for Codex login (their own, not shared) — _____
- [ ] API key(s): Anthropic and/or OpenAI (entered per-tenant in Settings → AI Providers) — _____
- [ ] Which agents use Codex vs API — _____

## The agent's world (this is a full-access "digital COO")
- [ ] **ERPNext:** base URL, API key/secret (a scoped API user is better than admin) — _____
  - Read + write? Which doctypes should it touch? — _____
- [ ] **Email:** the mailbox it acts as — SMTP host/port/user/pass, IMAP host/port/user/pass — _____
- [ ] **Servers to manage:** hostnames, and how the agent authenticates (SSH key). Start in **safe** mode. — _____
  - What monitoring should it do? (disk, services, logs, uptime) — _____
- [ ] **Telegram:** a bot per agent (BotFather token) so the team talks to it + gets approval cards — _____
- [ ] **Approvers:** who signs off writes/sends (name + their Telegram) — _____

## Persona & branding
- [ ] Agent name, title, avatar, personality/"soul" (like Natalie, but Metcheck's) — _____
- [ ] Company/branding: name, logo for the dashboard — _____
- [ ] Timezone (for schedules) — Africa/Gaborone (Botswana, UTC+2) unless told otherwise
- [ ] Business hours for scheduled inbox checks — _____

## Policies
- [ ] What must ALWAYS require human approval — _____
- [ ] What the agent may do autonomously (read-only, safe reads) — _____
