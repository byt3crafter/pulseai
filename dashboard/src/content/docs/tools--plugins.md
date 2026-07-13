Plugins bundle a set of tools, credentials, and sometimes a sign-in flow into one installable unit — think "connect ERPNext" or "give agents a browser," rather than defining one HTTP call at a time the way [Custom Tools](/dashboard/docs/tools/custom) do.

Getting a plugin's tools in front of an agent takes three separate steps, in order. Miss one and the tool won't appear — with no error shown to the agent, so if a tool seems to be missing, work back through this list.

## The three gates

1. **Platform approval.** Before a plugin is available to any workspace, a Pulse platform administrator reviews what it's asking permission to do (which external services it talks to, what it can access) and approves it. This step is entirely on our side — there's nothing for you to do here, and nothing to enable on your own. If a plugin you expect to see is missing from your workspace's plugin list, this is the first thing to check with your Pulse administrator or support.
2. **Workspace enable + credentials** (**Settings → Plugins**, shown as "Business Integrations"). Once a plugin has been approved for the platform, you can enable or disable it for your own workspace and fill in its credentials. Credential values are encrypted before they're stored; leaving a field blank when you save keeps whatever was already stored there.
3. **Per-agent access** — via [Tools & Skills](/dashboard/docs/agents/tools) and [Tool Policy](/dashboard/docs/agents/tool-policy) on the agent editor. Enabling a plugin for your workspace makes its tools *available*; whether a given agent can actually call them — and whether a call needs a person's approval first — is still controlled there.

## Installed plugins

This is the complete list of plugins available today — there is no hidden or partially available extra one.

| Plugin | What it does | Setup |
|---|---|---|
| **ERPNext** | Lets an agent list, look up, create, update, and delete records in your ERPNext instance, run financial and stock reports, and call whitelisted server actions (e.g. submitting a document). | Enter your **ERPNext URL**, **API Key**, and **API Secret** — found in ERPNext under User Settings → API Access. No sign-in flow required. |
| **OneDrive** | Lets an agent list, search, read, upload, share, and delete files in your organization's OneDrive / Microsoft 365. | See below — partially one-click. |
| **Web Search** | Gives an agent a `web_search` tool for looking things up online. Results are AI-summarized, not raw search-engine listings. | Enter a **Tavily API Key** — a free key from tavily.com. |
| **Voice** | Lets an agent transcribe voice messages to text and reply with spoken audio. | No credentials required — it reuses the OpenAI connection you've already set up under AI Providers. Optionally add an **ElevenLabs API Key** and **Voice ID** for premium voices instead of the standard ones. |
| **Image Generation** | Lets an agent generate images from a text description and send them into the conversation. | No setup beyond having a MiniMax connection under AI Providers — images are billed per generation through that connection. An **Enable Image Generation** field acts as an on/off switch for your workspace if you ever need to turn it off. |
| **Browser** | Gives an agent a real browser it can navigate, click, fill in forms, extract content from, and screenshot. | See the note below on network access. No credentials required. |
| **Commitments** | Lets an agent record a follow-up to come back to later and check it off when done. How a due follow-up is delivered is a setting for your workspace — see [Commitments & follow-ups](/dashboard/docs/automation/commitments) for the full picture; this plugin adds the tools that create, list, and close them. |

### OneDrive: one-click connect, but not zero-setup

The **Connect OneDrive** button on Settings → Plugins genuinely automates sign-in — click it, sign into Microsoft, and Pulse stores what it needs for you. It only appears once you've entered an **Azure App (Client) ID** and **Client Secret** (and optionally a **Tenant ID**), and getting those means creating a free app registration in Microsoft's own Entra admin center yourself — that part happens outside Pulse. If you'd rather skip the Connect button, you can instead paste a manually obtained refresh token directly into the **Refresh Token** field.

### Browser: internal network access is blocked by default

The browser plugin can navigate anywhere on the open internet by design. What's blocked by default is access to internal or private network addresses — an agent can't use the browser to reach machines on your internal network unless a Pulse administrator or workspace owner deliberately turns that on for your workspace. Treat turning it on as equivalent to giving the agent a foothold on your internal network, and only do it if agents genuinely need that access.

Each agent's browser session is private to it and closes automatically after a few minutes of inactivity. Screenshots and saved images are delivered straight into the conversation (for example, into Telegram) when possible — the agent itself cannot "see" an image it captures, only report that it was sent.

## Good to know

- Platform approval isn't a one-time event: if what a plugin is permitted to access ever changes, it goes back into a pending state until reviewed again, even for a plugin already approved once.
- A plugin being enabled for your workspace doesn't mean every agent has it — check each agent's Tools & Skills section. [Custom Tools](/dashboard/docs/tools/custom) and [Servers](/dashboard/docs/tools/servers) skip the platform-approval step because they're things you build and own yourself; plugins are the one case where a Pulse administrator is in the loop before you can even see the credential form.
