/**
 * Minimal HS256 JWTs for the Pulse desktop/mobile app. Signed with the shared
 * NEXTAUTH_SECRET so no extra dependency is needed. Carries the user's id,
 * tenant, and role; validated on every /api/app/* request.
 */
import { createHmac, timingSafeEqual } from "crypto";

const SECRET = process.env.NEXTAUTH_SECRET || process.env.ENCRYPTION_KEY || "";

export interface AppTokenPayload {
    sub: string; // user id
    tid: string | null; // tenant id
    role: string;
    accessRole?: string;
    iat?: number;
    exp?: number;
}

function b64url(buf: Buffer): string {
    return buf.toString("base64url");
}

export function signAppToken(payload: Omit<AppTokenPayload, "iat" | "exp">, ttlSeconds = 60 * 60 * 24 * 7): string {
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
    const body = b64url(Buffer.from(JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds })));
    const data = `${header}.${body}`;
    const sig = b64url(createHmac("sha256", SECRET).update(data).digest());
    return `${data}.${sig}`;
}

export function verifyAppToken(token: string): AppTokenPayload | null {
    if (!token || !SECRET) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [h, b, s] = parts;
    const expected = b64url(createHmac("sha256", SECRET).update(`${h}.${b}`).digest());
    const a = Buffer.from(s);
    const e = Buffer.from(expected);
    if (a.length !== e.length || !timingSafeEqual(a, e)) return null;
    try {
        const payload = JSON.parse(Buffer.from(b, "base64url").toString()) as AppTokenPayload;
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
        return payload;
    } catch {
        return null;
    }
}
