Plugins bundle a set of tools, credentials, and (sometimes) an OAuth flow into one installable unit — think "connect ERPNext" or "give agents a browser," rather than defining one HTTP call at a time the way [Custom Tools](/docs/tools/custom) do. Plugins live on disk in `pulse/plugins/` and are discovered automatically when the gateway starts.

Getting a plugin's tools in front of an agent takes three separate switches, in order — miss one and the tool simply won't appear, with no error shown to the agent:

## The three gates

1. **Platform approval** (`/admin/plugins`, admin-only). When the gateway discovers a plugin, it's **pending approval** until an admin reviews its declared permissions (network hosts, filesystem paths, shell commands) and clicks **Approve capabilities**. A plugin can also be enabled/disabled globally here, and an admin can override enablement per tenant. If a plugin's declared permissions change after approval (a new version asks for more), it's automatically deactivated as **"Capabilities changed — re-approve"** until reviewed again.
2. **Workspace enable + credentials** (**Settings → Plugins**, called "Business Integrations" in the UI, tenant-side). Once a plugin is globally approved, each workspace can enable/disable it independently and fill in its credentials. Credential values are encrypted with AES-256-GCM; leaving a field blank on save keeps whatever was already stored.
3. **Per-agent access** — via [Tools & Skills](/docs/agents/tools) and [Tool Policy](/docs/agents/tool-policy) on the agent editor. Enabling a plugin for the workspace makes its tools *available*; whether a given agent can actually call them (and whether a call needs human approval first) is still controlled there.

## Installed plugins

These seven exist in `pulse/plugins/` today — this list is exhaustive; there is no hidden or half-shipped eighth plugin.

| Plugin | Tools | Credentials | Setup |
|---|---|---|---|
| **ERPNext** | `erpnext_list`, `erpnext_get`, `erpnext_create`, `erpnext_update`, `erpnext_delete`, `erpnext_report`, `erpnext_method` | `ERPNEXT_URL`, `ERPNEXT_API_KEY`, `ERPNEXT_API_SECRET` | Paste your ERPNext site URL and an API key/secret from ERPNext's own User Settings → API Access. No OAuth. |
| **OneDrive** | `onedrive_list`, `onedrive_search`, `onedrive_get`, `onedrive_read`, `onedrive_upload`, `onedrive_create_folder`, `onedrive_share`, `onedrive_delete` | `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT_ID` (optional, defaults `common`), `MS_REFRESH_TOKEN` | See below — partially one-click. |
| **Web Search** | `web_search` | `TAVILY_API_KEY` | Free key from tavily.com. Search results are AI-optimized (Tavily), not raw Google/Bing results. |
| **Voice** | `voice_transcribe` (Whisper), `text_to_speech` | None required — reuses your existing OpenAI provider key. `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` optional, for premium voices instead of OpenAI TTS. | Just enable it once OpenAI is connected under AI Providers. |
| **Image Generation** | `image_generate` (MiniMax image-01) | Reuses your MiniMax key from AI Providers. `IMAGEGEN_ENABLED` credential field is really a kill switch — type `false` to disable it for the workspace, blank/anything else = on. | Billed per image by MiniMax. |
| **Browser (Playwright)** | `browser_navigate`, `browser_screenshot`, `browser_click`, `browser_fill`, `browser_extract`, `browser_close`, `browser_save_image` | `PLAYWRIGHT_ALLOW_PRIVATE_NETWORK` (default `false`), `PLAYWRIGHT_ENABLE_IMAGE_FETCH` (default enabled) | See SSRF note below. Driven by a system Chromium via `playwright-core` — no browser download bundled. |
| **Commitments** | `commitment_create`, `commitment_list`, `commitment_complete` | None | Lets an agent record a follow-up to come back to later. Delivery behavior when one is due is a per-tenant setting — see [Commitments & follow-ups](/docs/automation/commitments) for the full picture; this plugin just adds the tools that create/list/close them. |

### OneDrive: one-click connect, but not zero-setup

The **Connect OneDrive** button on Settings → Plugins genuinely automates the OAuth token exchange — click it, sign into Microsoft, and Pulse stores the refresh token for you. But it only appears once `MS_CLIENT_ID` and `MS_CLIENT_SECRET` (and optionally `MS_TENANT_ID`) are already filled in, and getting those still means creating an Azure Entra app registration yourself (free, but manual, on Microsoft's side). If you'd rather skip the Connect button, you can also paste a manually-obtained refresh token (scopes `Files.ReadWrite.All offline_access User.Read`) straight into the `MS_REFRESH_TOKEN` field.

### Browser tools: SSRF guard on by default

Playwright's declared network permission is `*` — an agent with this plugin can navigate anywhere on the open internet by design. What's guarded is **internal/private network access**: navigation to loopback, link-local, and private-range hosts is **blocked by default**. An admin can lift that per workspace by setting `PLAYWRIGHT_ALLOW_PRIVATE_NETWORK` to `true` if agents genuinely need intranet access — treat that as equivalent to giving the agent a foothold on your internal network.

Each agent's browser session is private to it and auto-closes after a few minutes of inactivity (or on `browser_close`). Screenshots and saved images are delivered straight into the chat (Telegram) when possible — the agent cannot itself "see" an image it captures.

## Good to know

- The admin approval step is capability-based, not per-plugin-forever: any change to a plugin's declared `permissions` (network hosts, filesystem paths, commands) re-triggers the pending-approval state, even for a plugin an admin already approved once.
- A plugin being enabled for your workspace doesn't mean every agent has it — check each agent's Tools/Skills section. This is the same gating chain [Custom Tools](/docs/tools/custom) and [Servers](/docs/tools/servers) skip (they're tenant-owned, not platform-installed), so plugins are the one case where an admin is in the loop before you can even see the credential form.
