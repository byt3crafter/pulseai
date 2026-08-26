import { NextResponse } from "next/server";

export const runtime = "nodejs";

type CustomRuntimeRequestBody = {
  runtimeUrl?: string;
  pathname?: string;
  method?: string;
  body?: unknown;
};

const isRuntimeUrlAllowed = (runtimeUrl: string): boolean => {
  const rawAllowlist = (
    process.env.CUSTOM_RUNTIME_ALLOWLIST ||
    process.env.UPSTREAM_ALLOWLIST ||
    ""
  ).trim();
  if (!rawAllowlist) {
    return process.env.NODE_ENV !== "production";
  }
  try {
    const parsed = new URL(runtimeUrl);
    const allowed = rawAllowlist
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
    return allowed.includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
};

const normalizeRuntimeUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("runtimeUrl is required.");
  }
  const parsed = new URL(trimmed);
  if (parsed.protocol === "ws:") {
    parsed.protocol = "http:";
  } else if (parsed.protocol === "wss:") {
    parsed.protocol = "https:";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("runtimeUrl must use http, https, ws, or wss.");
  }
  parsed.username = "";
  parsed.password = "";
  const normalized = parsed.toString().replace(/\/$/, "");
  if (!isRuntimeUrlAllowed(normalized)) {
    throw new Error("runtimeUrl is not in the allowed hosts list.");
  }
  return normalized;
};

/**
 * Exchange the caller's dashboard session for a gateway token.
 *
 * Cached briefly per cookie so a busy office does not mint a token per request;
 * the dashboard issues 12h tokens, so a minute of caching is conservative.
 */
type CachedToken = { token: string; expiresAt: number };
const tokenCache = new Map<string, CachedToken>();
const TOKEN_TTL_MS = 60_000;

async function resolveRuntimeToken(request: Request): Promise<string> {
  // An explicit token still wins — useful for headless/CI and for running the
  // office against a runtime that has no dashboard in front of it.
  const explicit = (process.env.CUSTOM_RUNTIME_TOKEN || "").trim();
  if (explicit) return explicit;

  const cookie = request.headers.get("cookie") ?? "";
  if (!cookie) return "";

  const cached = tokenCache.get(cookie);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  // Same origin, so a relative URL would work in the browser — but this runs on
  // the server, where it needs an absolute one.
  const base = (process.env.PULSE_DASHBOARD_URL || "http://localhost:3001").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/office/token`, {
      headers: { cookie, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return "";
    const body = (await res.json()) as { token?: string };
    const token = typeof body.token === "string" ? body.token : "";
    if (token) {
      tokenCache.set(cookie, { token, expiresAt: Date.now() + TOKEN_TTL_MS });
      if (tokenCache.size > 200) tokenCache.delete(tokenCache.keys().next().value as string);
    }
    return token;
  } catch {
    // No dashboard reachable: fall through unauthenticated and let Pulse 401.
    return "";
  }
}

const normalizePathname = (value: unknown): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("pathname is required.");
  }
  const trimmed = value.trim();
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

const normalizeMethod = (value: unknown): "GET" | "POST" => {
  if (typeof value !== "string") return "GET";
  const upper = value.trim().toUpperCase();
  if (upper === "POST") return "POST";
  return "GET";
};

export async function POST(request: Request) {
  let payload;
  try {
    payload = (await request.json()) as CustomRuntimeRequestBody;
  } catch (error) {
    console.error("[runtime/custom] Invalid JSON request body.", error);
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  try {
    const runtimeUrl = normalizeRuntimeUrl(payload.runtimeUrl ?? "");
    const pathname = normalizePathname(payload.pathname);
    const method = normalizeMethod(payload.method);
    // Propagate the browser abort signal so that cancelling the client-side fetch
    // (e.g. hitting Stop) also cancels the upstream runtime request.
    // PULSE PATCH: authenticate as the signed-in dashboard user.
    //
    // Upstream sends no Authorization header at all — it assumes a single-tenant
    // orchestrator on a trusted network. Pulse is multi-tenant and derives the
    // tenant FROM the credential, so an unauthenticated call is both rejected
    // and, if it were not, a cross-tenant leak.
    //
    // Rather than have someone paste a token into settings (a second login, and
    // one token for everybody), we forward the caller's dashboard session cookie
    // to Pulse and get back a token minted for THAT user. The office can only
    // ever show the workspace of the person looking at it, and there is nothing
    // to configure.
    const runtimeToken = await resolveRuntimeToken(request);
    const response = await fetch(`${runtimeUrl}${pathname}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(runtimeToken ? { Authorization: `Bearer ${runtimeToken}` } : null),
        ...(method === "POST" ? { "Content-Type": "application/json" } : null),
      },
      body: method === "POST" ? JSON.stringify(payload.body ?? {}) : undefined,
      cache: "no-store",
      signal: request.signal,
    });
    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Custom runtime proxy failed.";
    const status =
      message === "runtimeUrl is required." ||
      message === "pathname is required." ||
      message === "runtimeUrl must use http, https, ws, or wss." ||
      message === "runtimeUrl is not in the allowed hosts list."
        ? 400
        : 502;
    console.error("[runtime/custom] Proxy request failed.", error);
    return NextResponse.json(
      {
        error:
          status === 400
            ? message
            : "Custom runtime proxy failed.",
      },
      { status }
    );
  }
}
