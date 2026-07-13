The Server Inventory gives an agent real SSH access to a machine you register — with guardrails enforced in code, not just by prompting the model to "be careful." Use it for an agent that needs to check logs, restart a service, or run deploy scripts on your actual infrastructure.

Servers live at **Tools & Infrastructure → Servers**.

## Adding a server

| Field | Notes |
|---|---|
| **Name, Host, Port, Username** | Standard SSH connection details. |
| **Authentication** | SSH key (paste the private key) or password. Either is encrypted at rest with AES-256-GCM and never shown again in plaintext — editing a server leaves the secret unchanged unless you paste a new one. |
| **Test connection** | Verifies the credentials before you save. |
| **Environment** | `production`, `staging`, or `dev` — purely informational, except it triggers the extra confirmation below. |
| **Safety mode** | `observe`, `safe`, or `full` — see below. |
| **Require approval** | `off`, `writes only`, or `everything` — see below. |
| **Operating instructions** | Free text shown to the agent *verbatim* before every command, e.g. "This is production. Never restart the database. Deploy only via `./deploy.sh`." |
| **Agent access** | Which agents may use this server. |
| **Enabled** | Disabled servers are invisible to every agent, regardless of access below. |

> Selecting **Full** safety mode on a **Production** server requires you to tick "I understand the risk" before you can save — full access removes every guardrail below.

## Default-deny agent access

Unlike Custom Tools (available to all agents unless scoped), a server with no agents selected in **Agent access** is available to **no one**. You must explicitly grant each agent access — this is infrastructure, not a generic API call, so the default is deny.

## Safety modes

Safety is enforced by `command-policy.ts` before a command ever reaches SSH — it isn't advisory.

| Mode | Behavior |
|---|---|
| **Observe** | Read-only diagnostics only. A single simple command — no `; & \| < > `` $()` chaining. Only an allowlist of binaries is permitted: `df, du, free, uptime, uname, whoami, id, ps, top, ls, cat, tail, head, grep, find, stat, journalctl, ss, netstat, ip, ping`, plus `systemctl status`, `docker ps/logs/stats/inspect`, and read-only `curl` (no `-o`, `-d`, `-X POST/PUT/DELETE`, etc.). |
| **Safe** | Anything *except* a blocklist of destructive patterns — matched against the whole command string, so hiding a dangerous command behind `&&` or `;` doesn't help. Blocked: `rm -rf /` and unqualified recursive deletes, `mkfs`, raw writes to `/dev/sd*`, `wipefs`, disk partitioning tools, `shutdown/reboot/halt/poweroff`, `systemctl mask`, `userdel/groupdel`, `passwd`, recursive `chmod`/`chown` on `/`, fork bombs, `iptables -F`, `ufw disable`, SQL `DROP TABLE/DATABASE` and `TRUNCATE`, `history -c`, `crontab -r`. |
| **Full** | No restrictions in code. The agent can run anything, including everything blocked above. Only for servers you fully trust the agent (and its prompt) with. |

A blocked command never reaches SSH — the agent gets back the block reason and the server's operating instructions, and the attempt is still logged (see Audit below).

## Approval gate

Independent of safety mode, **Require approval** can hold a command for a human to approve:

- **Off** — never asks.
- **Writes only** — asks for anything that isn't classified read-only (the same allowlist Observe mode uses defines "read-only," regardless of the server's actual safety mode).
- **Everything** — asks for every command.

An approval request goes out as an interactive card to whoever is marked an approver on the [People](/docs/people) page, and the command waits for a decision (or times out). A **standing allowance** — "Allow always," granted from a previous approval card — bypasses this permanently for that server, until an admin revokes it. See [Approval gates](/docs/approvals) for how the underlying approval flow works.

## What the agent actually calls

Two tools are added to an agent's toolset only if it has at least one accessible server:

- **`server_list`** — lists the servers this agent can reach, each with its safety mode and operating instructions. The agent is instructed to always call this first.
- **`server_exec`** — runs a command on a named server, subject to the policy and approval checks above. Output is truncated to 8,000 characters back to the model (the SSH layer itself caps raw stdout/stderr at 100 KB per stream); default command timeout is 30 seconds, capped at 120.

## Audit log

Every `server_exec` attempt — blocked, approved, denied, or executed — is written to `server_exec_logs`: command text, whether it was blocked and why, exit code, duration, and the first 500 characters of output.

> There is currently no dashboard page to view this log — the data is captured but not yet surfaced in the UI. Today, checking it means querying `server_exec_logs` directly in Postgres.
