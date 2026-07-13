This page covers what protects your data in Pulse: how credentials are stored, who can see what inside your workspace, the record kept of sensitive actions, the optional sign-in protections available to you, and the safety controls that stop an agent from acting without a person's say-so or reaching places it shouldn't.

## Credentials and API keys are encrypted

Every secret you give Pulse — an AI provider key, a Custom Tool's API key or bearer token, an email password, SSH credentials for a connected server, a two-factor secret — is encrypted with AES-256 before it's stored. Once saved, a secret is never shown back to you in plaintext; if you need to change it, you replace it, you don't retrieve the old one.

One exception is worth knowing about directly: authentication headers you enter for an [MCP server](/dashboard/docs/tools/mcp) are not encrypted at rest today. Until that changes, use a scoped, low-privilege token there rather than a broadly powerful one.

Two-factor recovery codes are handled differently again — they're one-way hashed rather than encrypted, the same way a password is, because they only ever need to be checked, never displayed again.

## Your workspace is isolated from every other workspace

Pulse is multi-tenant: many businesses share the same platform, and each one's workspace — its agents, conversations, credentials, and settings — is walled off from every other's. Every request your team makes is scoped to your workspace specifically; there is no query path in the product that can return another workspace's data by mistake. If you ever see or suspect data that doesn't belong to your workspace, that's treated as a defect to report immediately, not an edge case.

## Roles: who can see and do what

Every person who signs in has a role that determines what they can do inside your workspace:

| Role | Can do |
|---|---|
| **Owner** | Full control — configure agents, manage billing, invite and remove people, everything below. |
| **Member** | Configure and use agents day to day, without access to billing or managing other people's accounts. |
| **Viewer** | Read-only — can see agents, conversations, and settings, but can't change anything. |

Separately, on the Pulse platform side, a small platform team can access administrative functions needed to operate the service (provisioning workspaces, approving plugins, providing support) — with their own narrower roles, from full platform access down to read-only audit access. Platform staff do not casually browse workspace data; access is role-gated and logged the same way yours is.

## The audit trail

Sensitive actions are recorded: who did it, what they did, what it was done to, when, and from where. This covers things like changes to people's roles, plugin approvals, and workspace configuration changes. If your account has the right role, you can review this history from **Admin → Audit**; if you're on a plan where that page isn't visible to you, ask your Pulse administrator for a copy of the relevant entries.

Two narrower records exist alongside the main audit trail: one covering every attempt an agent makes to run code in its sandbox, and one covering every command an agent runs on a [connected server](/dashboard/docs/tools/servers). Neither of these has a dashboard page to browse today — if you need to review one, ask your Pulse administrator or support.

## Single sign-on and two-factor authentication

If your organization uses single sign-on (SSO) with an identity provider, Pulse can be set up to accept sign-ins through it, with group membership in your identity provider mapped to a role inside Pulse automatically. This isn't self-serve — plain email-and-password sign-in keeps working until your Pulse administrator or support sets SSO up for your workspace, and it can optionally be restricted to people with an email address on your company's domain.

Independently of SSO, any individual can turn on two-factor authentication for their own account from **Account → Two-Factor**. Once it's on, signing in requires a one-time code from an authenticator app, or one of ten single-use backup codes generated when you set it up — there is no way to sign in with only a password once two-factor is enabled.

## Approval gates: a safety control, not a formality

For any tool an agent can use — sending an email, running a command on a server, calling one of your own APIs — you can require that a person approve the specific action before it runs, rather than trusting the agent to always get it right. This is covered fully in [Approval gates](/dashboard/docs/approvals), but the short version: the agent drafts or prepares the action, a person sees exactly what it's about to do, and nothing happens until they approve it. If nobody responds in time, the action does not run, and the people responsible are notified so it doesn't quietly fail to happen.

## Guard rails on outbound connections

When an agent calls out to an address you've configured — through a [Custom Tool](/dashboard/docs/tools/custom) or the browser tool in [Plugins](/dashboard/docs/tools/plugins) — Pulse blocks the request if it resolves to an internal or private network address, a loopback address, or a cloud provider's internal metadata endpoint, regardless of what address was originally configured. This stops a tool from being used, deliberately or by accident, to reach infrastructure it was never meant to touch.

[Servers (SSH)](/dashboard/docs/tools/servers) work differently on purpose, because the address there is one you entered yourself, not something a tool is guessing at: instead of blocking addresses, access is controlled per server through a safety mode (how destructive a command is allowed to be), a default-deny list of which agents can reach it at all, and an optional approval requirement before any command runs.
