Your agent's personality, name, and behavior are built from a set of small notes you edit on the agent's page, plus a few settings on its Profile card. There's no single "personality" text box — each note has a specific job, and they're combined automatically every time the agent replies.

## The notes that build your agent's persona

Open an agent and look at the tabs on the left. These are the building blocks:

| Tab | What you write there |
|---|---|
| Identity | The agent's name, role, and background — how it introduces itself. |
| Soul | Personality, values, and communication style. This is the core of who the agent is. |
| Agents | An operating manual for the agent itself — how it should use its own notes, handle memory, and behave in different situations. |
| Bootstrap | A first-run onboarding script for a brand-new agent. The agent clears this note on its own once it's introduced itself, so don't be surprised when it's empty later. |
| Memory | A short, curated note the agent keeps about itself and what matters most. This is separate from searchable long-term memory — see [Memory](/dashboard/docs/agents/memory). |
| Tools Guidance | Freeform notes on how the agent should use tools it already has — hostnames, preferred formats, house rules. |
| User Preferences | What the agent should know about you: how to address you, preferred formats, language, timezone. |
| Heartbeat Prompt | Instructions for what the agent should check during its own recurring self-check — see [Heartbeat](/dashboard/docs/automation/heartbeat). |

> The Tools Guidance tab is notes only. Writing something there does not grant the agent access to anything — see [Tools & Skills](/dashboard/docs/agents/tools) for what actually turns a tool on.

## Letting the agent edit its own notes

The **Agent Self-Config** toggle (on the Agents tab) lets the agent rewrite its own Identity, Soul, Tools Guidance, User Preferences, Memory, and Heartbeat notes when you simply tell it to in conversation — for example, "be more concise" or "remember our deploys run on Fridays." Turn it off and only you can edit these notes, from this dashboard.

## Order and limits

When the agent replies, its notes are combined in a fixed order: Identity first, then Soul, then its Agents manual, then Bootstrap (while it still exists), then Memory, then any reference documents you've attached under Knowledge. A fixed set of voice and formatting rules — be genuinely helpful, format data clearly, don't over-introduce itself — is built into every agent and isn't editable from any note.

If you set a name on the Identity tab, the agent treats it as final. It won't drift back to an old name partway through a long conversation, even if an earlier note mentions a different one.

> Keep each note reasonably short. Every note has a size ceiling in the tens of thousands of characters, and everything the agent actually sees is capped as a combined total too. Go well over that and the middle of the longest notes gets quietly dropped — the agent still sees the beginning and the end, just not everything in between. If an agent seems to have "forgotten" something you know you wrote, check whether Soul or Memory has grown very long.

## Profile

The Profile card holds the parts of identity that show up in the interface, separate from the agent's own notes:

| Field | Effect |
|---|---|
| Profile picture | PNG, JPEG, or WEBP, up to 500KB. Shown in the dashboard and in channels; falls back to initials if unset. |
| Full name | The agent's display name. |
| Role / title | A subtitle shown under the name. |
| Thinking | How much the agent reasons before answering (Default, Minimal, Low, Medium, High, or Extra High). Only affects models that support adjustable reasoning — on other models it's simply ignored. |
| Progress updates | Whether the agent narrates its steps while it works (Progress), adds its reasoning too (Verbose), or stays quiet until the final reply (Off). |

## Model

A separate **Model** card sets which AI model powers the agent. The dropdown only lists models from providers you've connected under **Settings → AI providers** — you can't point an agent at a provider you haven't set up. New models from a connected provider tend to appear in the list automatically as they're released.

## Revisions

Every change to any of the agent's notes — whether you typed it or the agent edited itself via Self-Config — is saved as a numbered revision with a short summary. The **Revisions** tab lets you pick any note and step back through its history, with one-click restore. Restoring doesn't erase what happened in between; it's saved as a new revision of its own, so the trail stays intact.

## Related

- [Memory](/dashboard/docs/agents/memory) — the full picture of what an agent remembers, including its Memory note versus searchable long-term memory.
- [Tools & Skills](/dashboard/docs/agents/tools) — what actually decides which tools an agent can use.
