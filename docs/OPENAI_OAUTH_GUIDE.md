# OpenAI ChatGPT OAuth Integration Guide

Complete guide for implementing OpenAI's OAuth 2.0 PKCE flow to let ChatGPT Plus/Pro/Team subscribers authenticate via their ChatGPT account instead of providing an API key.

---

## Table of Contents

1. [How It Works (High-Level)](#how-it-works)
2. [The "Authentication Error (unknown_error)" — Root Causes](#authentication-error-causes)
3. [OAuth Configuration](#oauth-configuration)
4. [Step-by-Step Implementation](#step-by-step-implementation)
5. [Backend: Using the Token](#backend-using-the-token)
6. [Common Pitfalls & Troubleshooting](#common-pitfalls)
7. [Full Code Reference](#full-code-reference)

---

## How It Works

```
┌──────────┐     1. Auth URL      ┌─────────────────────┐
│  Your    │ ──────────────────► │  OpenAI Auth Server   │
│  App     │                     │  auth.openai.com      │
│          │ ◄────────────────── │                       │
│          │   2. Redirect with  └─────────────────────┘
│          │      auth code
│          │
│          │   3. Exchange code   ┌─────────────────────┐
│          │ ──────────────────► │  OpenAI Token Server  │
│          │                     │  auth.openai.com      │
│          │ ◄────────────────── │  /oauth/token         │
│          │   4. access_token   └─────────────────────┘
│          │      + refresh_token
│          │
│          │   5. Use token       ┌─────────────────────┐
│          │ ──────────────────► │  ChatGPT Backend API  │
│          │                     │  chatgpt.com/backend  │
└──────────┘                     └─────────────────────┘
```

The flow uses **OAuth 2.0 Authorization Code with PKCE** (Proof Key for Code Exchange). This is required because the client is public (no client secret).

---

## Authentication Error Causes

The `"An error occurred during authentication (unknown_error)"` page from OpenAI is caused by one of these issues:

### 1. Wrong or Missing `redirect_uri`
- **Must be exactly:** `http://localhost:1455/auth/callback`
- This is hardcoded in OpenAI's Codex client registration. Any other URI will fail.
- No trailing slash. No port change. No HTTPS. Exactly this string.

### 2. Wrong `client_id`
- **Must be:** `app_EMoamEEZ73f0CkXaXp7hrann`
- This is OpenAI's public Codex CLI client ID. Using any other ID will fail unless you've registered your own OAuth app with OpenAI.

### 3. Invalid or Missing PKCE `code_challenge`
- Must be a valid S256 challenge (SHA-256 hash of verifier, base64url-encoded, no padding).
- If missing or malformed, OpenAI returns `unknown_error`.
- Common bug: using standard base64 instead of base64url (must replace `+` with `-`, `/` with `_`, remove `=` padding).

### 4. Missing Required Query Parameters
- All of these are **required**: `response_type`, `client_id`, `redirect_uri`, `scope`, `code_challenge`, `code_challenge_method`, `state`
- Missing any one → `unknown_error`.

### 5. Wrong `scope` Value
- **Must include:** `openid profile email offline_access`
- Must be space-separated (not comma-separated).
- If the scope doesn't match what the client ID is registered for, OpenAI rejects it.

### 6. Expired or Reused Authorization Code
- Auth codes are single-use and expire in ~10 minutes.
- If you try to exchange a code twice, or wait too long, the token exchange fails.

### 7. `code_verifier` Doesn't Match `code_challenge`
- The verifier sent during token exchange must produce the exact same challenge that was sent in the authorize URL.
- If you regenerate the verifier between steps, the exchange fails silently and OpenAI may show this error on retry.

---

## OAuth Configuration

### Endpoints

| Purpose | URL |
|---------|-----|
| Authorization | `https://auth.openai.com/oauth/authorize` |
| Token Exchange | `https://auth.openai.com/oauth/token` |
| ChatGPT API | `https://chatgpt.com/backend-api/codex/responses` |
| Standard API | `https://api.openai.com/v1/chat/completions` |

### Client Configuration

```typescript
const OPENAI_OAUTH_CONFIG = {
    clientId: "app_EMoamEEZ73f0CkXaXp7hrann",  // Codex CLI public client
    authorizationEndpoint: "https://auth.openai.com/oauth/authorize",
    tokenEndpoint: "https://auth.openai.com/oauth/token",
    redirectUri: "http://localhost:1455/auth/callback",
    scopes: "openid profile email offline_access",
};
```

> **Important:** This uses OpenAI's Codex CLI client ID. The redirect URI MUST be
> `http://localhost:1455/auth/callback` — this is the only URI registered for this client.

---

## Step-by-Step Implementation

### Step 1: PKCE Utilities

PKCE prevents authorization code interception attacks. You need three functions:

```typescript
// pkce.ts

// Generate a random code verifier (64 bytes → base64url, ~86 chars)
export function generateCodeVerifier(): string {
    const array = new Uint8Array(64);
    crypto.getRandomValues(array);
    return base64UrlEncode(array);
}

// Generate the S256 code challenge from the verifier
export async function generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return base64UrlEncode(new Uint8Array(hash));
}

// Generate a random state parameter (CSRF protection)
export function generateState(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return base64UrlEncode(array);
}

// Base64url encode WITHOUT padding (this is critical!)
function base64UrlEncode(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary)
        .replace(/\+/g, "-")   // + → -
        .replace(/\//g, "_")   // / → _
        .replace(/=+$/, "");   // Remove padding
}
```

**Critical:** Standard base64 will NOT work. OpenAI requires base64url without padding.

### Step 2: Build the Authorization URL

```typescript
// openai-oauth.ts

interface AuthUrlParams {
    codeChallenge: string;
    state: string;
    redirectUri: string;
}

export function buildOpenAIAuthUrl(params: AuthUrlParams): string {
    const url = new URL("https://auth.openai.com/oauth/authorize");

    // Required parameters
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", "app_EMoamEEZ73f0CkXaXp7hrann");
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("scope", "openid profile email offline_access");
    url.searchParams.set("code_challenge", params.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", params.state);

    // These help OpenAI route to the correct flow
    url.searchParams.set("id_token_add_organizations", "true");
    url.searchParams.set("codex_cli_simplified_flow", "true");
    url.searchParams.set("originator", "codex_cli_rs");

    return url.toString();
}
```

### Step 3: Frontend — Initiate the OAuth Flow

```typescript
// In your React/Next.js component

async function handleOpenAISignIn() {
    // 1. Generate PKCE values
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state = generateState();
    const redirectUri = "http://localhost:1455/auth/callback";

    // 2. Store PKCE values (needed later for token exchange)
    localStorage.setItem("openai_pkce_verifier", verifier);
    localStorage.setItem("openai_pkce_state", state);
    localStorage.setItem("openai_redirect_uri", redirectUri);

    // 3. Build the auth URL
    const authUrl = buildOpenAIAuthUrl({
        codeChallenge: challenge,
        state,
        redirectUri,
    });

    // 4. Option A: Redirect user to OpenAI
    window.location.href = authUrl;

    // 4. Option B: Copy URL for user to open manually
    //    (useful when your app can't receive the callback directly)
    await navigator.clipboard.writeText(authUrl);
    // Show UI: "Open this URL in your browser, then paste the callback URL back here"
}
```

### Step 4: Handle the Callback

After the user signs in, OpenAI redirects to:
```
http://localhost:1455/auth/callback?code=AUTH_CODE_HERE&state=STATE_HERE
```

Since this is `localhost:1455`, you need one of these approaches:

#### Option A: Run a local HTTP server on port 1455

```typescript
// Node.js — tiny callback server
import http from "http";

const server = http.createServer((req, res) => {
    const url = new URL(req.url!, `http://localhost:1455`);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`<h1>Error: ${error}</h1><p>${url.searchParams.get("error_description")}</p>`);
        return;
    }

    // Redirect to your actual app with the code
    const appUrl = `http://localhost:3001/dashboard/settings?openai_code=${code}&openai_state=${state}`;
    res.writeHead(302, { Location: appUrl });
    res.end();
});

server.listen(1455, () => console.log("OAuth callback server on :1455"));
```

#### Option B: Manual paste (no server needed)

The user opens the auth URL, signs in, and gets redirected to `localhost:1455` which won't load. They copy the full URL from the browser address bar and paste it back into your app:

```typescript
function handleManualPaste(pastedUrl: string) {
    const url = new URL(pastedUrl);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    // Validate state matches what we stored
    const savedState = localStorage.getItem("openai_pkce_state");
    if (state !== savedState) {
        throw new Error("State mismatch — possible CSRF attack");
    }

    if (error) {
        throw new Error(`OAuth error: ${error}`);
    }

    // Exchange the code for tokens
    const verifier = localStorage.getItem("openai_pkce_verifier")!;
    const redirectUri = localStorage.getItem("openai_redirect_uri")!;

    exchangeCodeForToken(code!, verifier, redirectUri);
}
```

### Step 5: Exchange the Authorization Code for Tokens

This is the most critical step. Mistakes here cause silent failures.

```typescript
// Server-side action (Next.js Server Action, API route, etc.)
// MUST be server-side — never expose token exchange in client-side code

interface ExchangeParams {
    code: string;
    codeVerifier: string;
    redirectUri: string;
}

export async function exchangeOpenAICode(params: ExchangeParams) {
    // 1. Exchange auth code for access token
    const tokenResponse = await fetch("https://auth.openai.com/oauth/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            code: params.code,
            redirect_uri: params.redirectUri,          // Must match step 2 exactly
            client_id: "app_EMoamEEZ73f0CkXaXp7hrann", // Same client ID
            code_verifier: params.codeVerifier,         // Raw verifier, NOT the challenge
        }).toString(),
    });

    if (!tokenResponse.ok) {
        const errorBody = await tokenResponse.text();
        console.error("Token exchange failed:", tokenResponse.status, errorBody);
        throw new Error("Token exchange failed");
    }

    const tokenData = await tokenResponse.json();
    // tokenData = {
    //   access_token: "eyJhbGciOi...",   ← JWT (this IS your API key)
    //   refresh_token: "rt_abc123...",    ← For refreshing later
    //   token_type: "Bearer",
    //   expires_in: 86400,               ← Seconds (usually 24h)
    //   id_token: "eyJ...",              ← OpenID Connect ID token
    // }

    // 2. Parse the JWT to extract account info
    const jwtPayload = parseJwtPayload(tokenData.access_token);
    // jwtPayload = {
    //   exp: 1711123456,
    //   scope: "openid profile email offline_access",
    //   "https://api.openai.com/auth": {
    //     chatgpt_account_id: "user_abc123...",
    //   }
    // }

    const accountId = jwtPayload["https://api.openai.com/auth"]?.chatgpt_account_id;
    const expiresAt = new Date(jwtPayload.exp * 1000);

    // 3. (Optional) Validate the token works
    const validateResponse = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!validateResponse.ok) {
        console.warn("Token validation failed — token may have limited permissions");
    }

    // 4. Store the tokens securely (encrypt at rest!)
    return {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        accountId,
        expiresAt,
    };
}

// Parse JWT payload without verification (we trust OpenAI's token server)
function parseJwtPayload(token: string): any {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Invalid JWT");
    const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
    return JSON.parse(payload);
}
```

**Critical details for the token exchange:**

| Parameter | Must Be | Common Mistake |
|-----------|---------|----------------|
| `Content-Type` | `application/x-www-form-urlencoded` | Using `application/json` — will fail |
| `redirect_uri` | Exact same URI from Step 2 | Different URI or encoding |
| `code_verifier` | The raw verifier string | Sending the challenge instead |
| `client_id` | `app_EMoamEEZ73f0CkXaXp7hrann` | Missing or wrong |
| `grant_type` | `authorization_code` | Typo or wrong grant type |

### Step 6: Use the Token to Call ChatGPT API

The access token can be used in **two ways**:

#### Way 1: Standard OpenAI API (Chat Completions)

```typescript
const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
    },
    body: JSON.stringify({
        model: "gpt-4o",
        messages: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: "Hello!" },
        ],
    }),
});
```

#### Way 2: ChatGPT Backend Codex API (Responses format)

This endpoint uses a different request/response format and requires the account ID header:

```typescript
// Extract account ID from the JWT
function extractAccountId(token: string): string {
    const parts = token.split(".");
    const payload = JSON.parse(
        Buffer.from(parts[1], "base64url").toString("utf-8")
    );
    return payload["https://api.openai.com/auth"].chatgpt_account_id;
}

const accountId = extractAccountId(accessToken);

const response = await fetch("https://chatgpt.com/backend-api/codex/responses", {
    method: "POST",
    headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
        "chatgpt-account-id": accountId,          // Required!
        "OpenAI-Beta": "responses=experimental",   // Required!
    },
    body: JSON.stringify({
        model: "gpt-4o",
        instructions: "You are a helpful assistant.",
        input: [
            { role: "user", content: "Hello!" },
        ],
        stream: true,
        store: false,
    }),
});

// Response is Server-Sent Events (SSE)
// Parse event types: response.output_text.delta, response.completed, etc.
```

---

## Common Pitfalls

### 1. Base64 vs Base64url

```
Standard base64: abc+def/ghi==
Base64url:        abc-def_ghi      ← What OpenAI expects (no padding!)
```

If your PKCE challenge uses standard base64, OpenAI returns `unknown_error`.

### 2. Content-Type for Token Exchange

```
WRONG:  Content-Type: application/json       → 400 Bad Request
RIGHT:  Content-Type: application/x-www-form-urlencoded
```

### 3. Sending Challenge Instead of Verifier

```
Step 2 (authorize URL): Send the code_challenge (hashed)
Step 5 (token exchange): Send the code_verifier (raw, unhashed)

Swapping these → token exchange fails silently
```

### 4. Redirect URI Mismatch

The `redirect_uri` in the token exchange request **must exactly match** what was in the authorize URL. Even a trailing slash difference will fail:

```
WRONG:  http://localhost:1455/auth/callback/   ← trailing slash
RIGHT:  http://localhost:1455/auth/callback     ← no trailing slash
```

### 5. State Parameter Mismatch

If you regenerate state between the authorize URL and the callback validation, your CSRF check will fail. Store it in localStorage or a server-side session.

### 6. Code Reuse

Authorization codes are **single-use**. If the token exchange fails and you retry with the same code, it will fail again. The user must go through the authorize flow again to get a fresh code.

### 7. Token Expiration

OAuth tokens from ChatGPT typically expire in ~24 hours. You must handle refresh:

```typescript
async function refreshOpenAIToken(refreshToken: string): Promise<string> {
    const response = await fetch("https://auth.openai.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
            refresh_token: refreshToken,
        }).toString(),
    });

    const data = await response.json();
    return data.access_token;  // New token, store it
}
```

---

## Full Code Reference

### Minimal Working Example (Node.js + Express)

```typescript
import express from "express";
import crypto from "crypto";

const app = express();
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const REDIRECT_URI = "http://localhost:1455/auth/callback";

// In-memory store (use a database in production)
const sessions: Record<string, { verifier: string; state: string }> = {};

// --- PKCE helpers ---
function base64url(bytes: Buffer): string {
    return bytes.toString("base64url"); // Node.js has native base64url
}

function generateVerifier(): string {
    return base64url(crypto.randomBytes(64));
}

async function generateChallenge(verifier: string): Promise<string> {
    const hash = crypto.createHash("sha256").update(verifier).digest();
    return base64url(hash);
}

function generateState(): string {
    return base64url(crypto.randomBytes(32));
}

// --- Routes ---

// 1. Start OAuth flow
app.get("/login/openai", async (req, res) => {
    const verifier = generateVerifier();
    const challenge = await generateChallenge(verifier);
    const state = generateState();
    const sessionId = crypto.randomUUID();

    sessions[sessionId] = { verifier, state };

    const url = new URL("https://auth.openai.com/oauth/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", CLIENT_ID);
    url.searchParams.set("redirect_uri", REDIRECT_URI);
    url.searchParams.set("scope", "openai profile email offline_access");
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", state);
    url.searchParams.set("codex_cli_simplified_flow", "true");
    url.searchParams.set("originator", "codex_cli_rs");

    // Set session cookie so we can look up verifier later
    res.cookie("oauth_session", sessionId, { httpOnly: true });
    res.redirect(url.toString());
});

// 2. OAuth callback (must run on port 1455!)
// This is a SEPARATE server — see below

// 3. Exchange code for token
app.get("/oauth/exchange", async (req, res) => {
    const { code, state } = req.query as { code: string; state: string };
    const sessionId = req.cookies?.oauth_session;
    const session = sessions[sessionId];

    if (!session || session.state !== state) {
        return res.status(400).json({ error: "Invalid state" });
    }

    const tokenRes = await fetch("https://auth.openai.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: REDIRECT_URI,
            client_id: CLIENT_ID,
            code_verifier: session.verifier,
        }).toString(),
    });

    if (!tokenRes.ok) {
        const err = await tokenRes.text();
        return res.status(400).json({ error: "Token exchange failed", details: err });
    }

    const tokens = await tokenRes.json();
    delete sessions[sessionId]; // Clean up

    // Parse JWT for account info
    const payload = JSON.parse(
        Buffer.from(tokens.access_token.split(".")[1], "base64url").toString()
    );

    res.json({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        accountId: payload["https://api.openai.com/auth"]?.chatgpt_account_id,
        expiresAt: new Date(payload.exp * 1000).toISOString(),
    });
});

app.listen(3000, () => console.log("App on :3000"));

// --- Callback proxy server (MUST be on port 1455) ---
import http from "http";
const callbackServer = http.createServer((req, res) => {
    const url = new URL(req.url!, "http://localhost:1455");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    // Redirect to your main app with the code
    res.writeHead(302, {
        Location: `http://localhost:3000/oauth/exchange?code=${code}&state=${state}`,
    });
    res.end();
});
callbackServer.listen(1455, () => console.log("Callback proxy on :1455"));
```

---

## Checklist Before Going Live

- [ ] PKCE uses base64url encoding (not standard base64)
- [ ] `redirect_uri` is exactly `http://localhost:1455/auth/callback`
- [ ] Token exchange uses `Content-Type: application/x-www-form-urlencoded`
- [ ] Token exchange sends `code_verifier` (not `code_challenge`)
- [ ] `redirect_uri` in token exchange matches the one in authorize URL
- [ ] State parameter is validated against stored value
- [ ] Authorization code is used only once
- [ ] Access token is stored encrypted at rest
- [ ] JWT payload is parsed to extract `chatgpt_account_id`
- [ ] ChatGPT backend requests include `chatgpt-account-id` header
- [ ] Token refresh is implemented for expired tokens
- [ ] Callback server runs on port 1455 (or manual URL paste flow is used)
