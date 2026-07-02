# Pulse AI — SSO (Single Sign-On) Guide

> Enterprise Single Sign-On via **OIDC** (OpenID Connect). Lets your clients' staff
> log into Pulse with their company identity provider (Okta, Microsoft Entra ID /
> Azure AD, Google Workspace, Auth0) instead of a Pulse password.

---

## 1. What it is (plain English)

- **SSO** = one corporate login controls Pulse access. When IT disables someone in
  Okta, they instantly lose Pulse access. No orphaned accounts.
- **OIDC** = the modern SSO protocol we implement. The user clicks "Sign in with
  \<company\>", authenticates at their IdP, and the IdP returns a signed token with
  their email, name, and group memberships.
- **JIT provisioning** = the first time someone signs in via SSO, Pulse creates their
  account automatically (no manual "Create User"). Their **Pulse role is derived from
  their IdP group** (see role mapping below).
- SSO is **off by default**. Email/password login keeps working exactly as before until
  an admin enables SSO. When enabled, both options appear on the login page.

Not yet implemented: SAML 2.0 and SCIM auto-deprovisioning (on the roadmap).

---

## 2. How it works in Pulse (the flow)

```
User → /login → "Sign in with <IdP>"      (button appears only when SSO is enabled)
     → redirected to the IdP (Okta/Entra/Google)
     → authenticates there (their MFA, their password policy)
     → IdP redirects back to  https://<your-domain>/api/auth/callback/sso
     → Pulse verifies the token, then:
          • checks the email domain is allowed
          • maps the IdP group → Pulse accessRole (RBAC)
          • finds or creates (JIT) the Pulse user
          • issues the session
```

- **Plane**: an SSO connection targets either the **platform** plane (Runstate staff →
  `/admin`) or a **tenant** plane (one workspace → `/dashboard`). Deployment-level SSO
  (one IdP per Pulse instance) is the typical setup for dedicated client deployments.
- **Role mapping**: IdP group → Pulse `accessRole` (owner/admin/support/auditor for
  platform; owner/member/viewer for tenant). Users with no matching group get the
  configured **default role**. Roles re-sync from the IdP on every login.

---

## 3. Configure it (admin)

**Admin → Settings → SSO.** Fields:

| Field | What it is |
|-------|-----------|
| **Enable** | Turns SSO on. Off = login page unchanged. |
| **Display name** | Button label, e.g. "Okta" → "Sign in with Okta". |
| **Issuer URL** | Your IdP's OIDC issuer, e.g. `https://your-org.okta.com` (Pulse auto-discovers the rest via `/.well-known/openid-configuration`). |
| **Client ID / Client Secret** | From the OIDC app you register in your IdP. Secret is encrypted at rest. |
| **Allowed email domains** | Optional allowlist (e.g. `acme.com`). Empty = any domain the IdP returns. |
| **Group claim** | The token claim holding groups (Okta/Entra: usually `groups`). |
| **Group → role map** | One `group=role` per line, e.g. `pulse-admins=admin`, `pulse-ops=support`. |
| **Default role** | Fallback role when no group matches (e.g. `auditor` = read-only). |
| **Plane / Tenant** | `platform` (admin console) or `tenant` (a workspace + its ID). |

**Copy the Redirect/Callback URL shown on that page** — `https://<your-domain>/api/auth/callback/sso` — and register it in your IdP app's "sign-in redirect URIs".

### Register the app in your IdP (one-time)
- **Okta**: Applications → Create App → OIDC → Web. Add the redirect URL. Grant scopes
  `openid email profile`. Add a **groups claim** to the ID token. Copy Client ID/Secret + your Okta domain (issuer).
- **Microsoft Entra ID**: App registrations → New. Add the redirect URL (Web). Add the
  `groups` optional claim. Issuer = `https://login.microsoftonline.com/<tenant-id>/v2.0`.
- **Google Workspace**: it doesn't emit groups by default — use domain allowlisting +
  default role, or map via a directory sync (future SCIM).

---

## 4. Security notes
- Client secret is **AES-encrypted** in the DB (same `ENCRYPTION_KEY` as other secrets).
- Domain allowlist + group→role mapping gate *who* gets in and *at what privilege*.
- SSO users have no local password (they can't use the email/password form).
- Because SSO is source-of-truth for roles, an SSO user's Pulse role is **overwritten
  from their IdP group on each login** — change access in your IdP, not in Pulse.
- Disabling a user in the IdP blocks new logins immediately; existing sessions expire
  on the JWT lifetime. (True instant revocation = SCIM, roadmap.)

---

## 5. Testing before production
Fully verifying the handshake needs a real IdP. Two easy paths:
1. **Google as a test OIDC IdP** — quick to stand up with a Google Cloud OAuth client;
   proves the end-to-end flow with a real account.
2. A **free Okta developer org** — closest to what enterprise clients use, and lets you
   test the groups→role mapping.

Recommended: test on a staging/dedicated instance first, confirm both SSO **and**
email/password still work, then enable on production.

---

## 6. Roadmap (SSO track)
- ✅ OIDC (this) — generic, works with Okta/Entra/Google/Auth0
- ⬜ SAML 2.0 (for orgs that mandate it)
- ⬜ SCIM 2.0 (auto-provision/deprovision from the IdP)
- ⬜ Per-tenant SSO on shared SaaS (route by email domain)
