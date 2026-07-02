# Pulse AI — Test Guide (non-technical, click-by-click)

Everything below is testable at **https://pulse.runstate.mu**. You only need a
web browser. Admin login: **https://pulse.runstate.mu/admin/login**.

> ⚠️ **Do this FIRST — safety:**
> 1. **Rotate the admin password.** It was previously written in a plaintext file. Log in, top-left avatar → **Account settings**, change it.
> 2. Before testing 2FA, **create a second Owner admin** (User Management → Create User, role ADMIN + Owner). If you ever lose your 2FA phone, the backup admin can rescue you.
> 3. Do risky tests (delete, purge) on **test data only**, never the real `runstate` workspace.

---

## 1. Log in & look around
1. Go to `/admin/login`, sign in.
2. You should see the **dark violet console**: sidebar (Platform Overview, Tenant/User Management, Conversations, Usage, Audit Log, Global Settings) and a live clock ticking in the bottom bar.
3. **Theme toggle:** top-right **sun/moon** icon → the whole console flips light ⇄ dark. ✅ if colors flip cleanly and text stays readable.

## 2. Two-Factor Authentication (2FA)
1. Sidebar → **Global Settings** → **Database & Security** tab → "My Account Security".
2. Click **Enable** → a **QR code** appears.
3. Open an authenticator app (Google Authenticator, Authy, 1Password) → scan the QR → it shows a 6-digit code.
4. Type the 6-digit code → **Verify & Enable**. ✅ You should see "two-factor is on".
5. **Test it:** sign out (avatar → Sign out) → log in again. After your password it should now **ask for the 6-digit code**. Enter the current code → you're in. ✅
6. To turn it off: same screen → **Disable** → enter a current code.
   > If you get locked out (lost phone), your backup Owner admin from step 0 can help, or I can clear it in the database.

## 3. Roles & permissions (RBAC)
1. **User Management** → each user row shows a **plane badge** (ADMIN/TENANT) + a **role dropdown** (Owner/Admin/Support/Auditor for admins).
2. Create a **test admin** with role **Auditor**: Create User → email `auditor-test@runstate.mu`, role **ADMIN**, access role **Auditor**. Copy the temp password shown.
3. Open a **private/incognito window**, log in at `/admin/login` as that auditor.
4. ✅ You should see the console **read-only**: no "Create Tenant"/"Create User" buttons, no delete/⋮ actions, Settings shows "Read-only access" and Save buttons disabled. (Auditor = look, don't touch.)
5. Try **Support** and **Owner** the same way to see the difference (Support can reset passwords; Owner can do everything).

## 4. Audit log
1. As Owner, do a few actions: create the test user, change someone's role, toggle a setting.
2. Sidebar → **Audit Log**. ✅ You should see rows: who, what action, when, IP.
3. Filter by action or actor email; click **Export CSV** → a spreadsheet downloads. ✅

## 5. Tenants (workspaces)
1. **Tenant Management** → you'll see workspaces (Runstate, etc.).
2. Click the **⋮** on a row → the menu (Suspend / Delete) appears cleanly aligned. (Don't delete a real one.)
3. **Create Tenant** → fill a test name/slug → it creates the workspace and shows the customer login + a temp password.

## 6. Email (so invites & password resets actually send)
1. **Global Settings** → **Email (SMTP)** tab.
2. Enter your mail provider's SMTP host, port, username, password, from-address → **Enable** → **Save**.
3. Put your own email in **"Send a test email"** → **Send test**. ✅ Check your inbox.
4. Now the **"Forgot password?"** link on the login page will actually email a reset link.

## 7. Plugins (capability approval)
1. Sidebar → **Global Settings** → **Plugins** (or the Plugins link).
2. The **erpnext** plugin shows an **Approved** badge + **Declared permissions** (Network: erpnext hosts).
3. This means: if a plugin ever changes what it can access, it gets **deactivated until you re-approve** it here — that's the security control. (Nothing to click unless a plugin needs approval.)

## 8. Usage & Conversations
- **Usage Analytics** → token/cost KPIs + top tenants (populates as agents run).
- **Conversations** → cross-tenant message threads; click one to read it.

---

## Things that need YOUR accounts before they can be tested
These are built/ready but need external setup only you can do:
- **SSO (OIDC)** — Admin → Settings → **SSO** tab. Needs an Okta / Microsoft Entra / Google OIDC app. See `docs/SSO_GUIDE.md`. Copy the callback URL shown into your IdP, paste the IdP's Client ID/Secret/Issuer, enable. Then a "Sign in with…" button appears on login.
- **WhatsApp / Slack channels**, **SAML**, **SCIM** — not built yet; require a Meta Business / Slack / SAML-IdP account to build against and test.

## If something looks wrong
Tell me the page and what you saw (a screenshot is perfect) and I'll fix it. Every change I ship is verified with an automated browser before it reaches you.
