Servers gives an agent real SSH access to a machine you register — with guard rails that are enforced automatically, not left to the agent's own judgment. Use it for an agent that needs to check logs, restart a service, or run deploy scripts on your own infrastructure.

Servers live at **Tools & Infrastructure → Servers**.

## Adding a server

| Field | Notes |
|---|---|
| **Name, Host, Port, Username** | Standard SSH connection details. |
| **Authentication** | SSH key (paste the private key) or password. Either is encrypted at rest and never shown again in plaintext — editing a server later leaves the secret unchanged unless you paste a new one. |
| **Test connection** | Verifies the credentials before you save. |
| **Environment** | `production`, `staging`, or `dev` — informational, except that it triggers the extra confirmation described below. |
| **Safety mode** | `observe`, `safe`, or `full` — see below. |
| **Require approval** | `off`, `writes only`, or `everything` — see below. |
| **Operating instructions** | Free text shown to the agent *verbatim* before every command, e.g. "This is production. Never restart the database. Deploy only via `./deploy.sh`." |
| **Agent access** | Which agents may use this server. |
| **Enabled** | A disabled server is invisible to every agent, regardless of the access you've granted. |

> Selecting **Full** safety mode on a **Production** server requires you to tick "I understand the risk" before you can save — full access removes every guard rail described below.

## Access is denied by default

Unlike Custom Tools, which are available to every agent unless you scope them, a server with no agents selected in **Agent access** is available to **no one**. You have to explicitly grant each agent access — because this is real infrastructure, not a generic API call, the default is deny.

## Safety modes

| Mode | Behavior |
|---|---|
| **Observe** | Read-only diagnostics only. A single simple command at a time — no chaining commands together. Only a fixed set of read-only tools is permitted (things like `df`, `ps`, `ls`, `cat`, `tail`, `grep`, `journalctl`, `docker ps/logs`, and read-only `curl`). |
| **Safe** | Anything except a list of destructive actions, regardless of how the command is phrased or chained. Blocked actions include wiping or reformatting disks, shutting down or rebooting the machine, deleting user accounts, changing passwords, recursively changing ownership on the root filesystem, disabling the firewall, and dropping or truncating databases. |
| **Full** | No restrictions. The agent can run anything, including everything blocked above. Use this only for a server you fully trust the agent — and its instructions — with. |

A blocked command never reaches the server — the agent gets back the reason it was blocked, along with the server's operating instructions, and the attempt is still recorded (see Audit trail below).

## Approval gate

Independent of safety mode, **Require approval** can hold a command for a person to sign off on first:

- **Off** — never asks.
- **Writes only** — asks for anything that isn't read-only.
- **Everything** — asks before every single command.

An approval request goes out as an interactive card to whoever is marked an approver on the [People](/dashboard/docs/people) page, and the command waits for a decision (or times out). A **standing allowance** — granted by tapping "Allow always" on a previous approval card — bypasses this permanently for that server, until someone with admin access revokes it. See [Approval gates](/dashboard/docs/approvals) for how the approval flow works in general.

## What the agent can do

An agent with access to at least one server gets two abilities: it can list the servers available to it, along with each one's safety mode and operating instructions, and it can run a command on one of them, subject to the safety mode and approval checks above. Output shown back to the agent is capped in length; a command that runs too long is stopped automatically after a timeout.

## Audit trail

> Every command attempt — blocked, approved, denied, or executed — is recorded: the command itself, whether it was blocked and why, whether it succeeded, how long it took, and a portion of its output. That said, there is currently no page in the dashboard to browse this history yourself. If you need to review it, contact your Pulse administrator or support.
