import { auth } from "../auth";
import { cookies } from "next/headers";
import { decode } from "next-auth/jwt";
import { hasPermission, type Permission } from "./permissions";

/**
 * Require an authenticated platform (admin-plane) user. Optionally require a
 * specific permission — if the user's accessRole lacks it, the call is denied.
 * No-arg calls only check plane membership (backward compatible).
 * Falls back to decoding the session JWT when auth() returns null (NextAuth v5
 * quirk in some server-action contexts).
 */
export async function requireAdmin(
    permission?: Permission,
): Promise<{ authorized: true; userId: string; accessRole: string } | { authorized: false; message: string }> {
    const resolved = await resolvePlatformUser();
    if (!resolved) return { authorized: false, message: "Unauthorized." };

    if (permission && !hasPermission("platform", resolved.accessRole, permission)) {
        return { authorized: false, message: "You don't have permission to perform this action." };
    }
    return { authorized: true, userId: resolved.userId, accessRole: resolved.accessRole };
}

async function resolvePlatformUser(): Promise<{ userId: string; accessRole: string } | null> {
    const session = await auth();
    if (session?.user?.role === "ADMIN") {
        return { userId: session.user.id, accessRole: (session.user as any).accessRole || "owner" };
    }

    try {
        const cookieStore = await cookies();
        const tokenCookie =
            cookieStore.get("authjs.session-token")?.value ||
            cookieStore.get("__Secure-authjs.session-token")?.value;
        if (!tokenCookie) return null;

        const secret = process.env.ENCRYPTION_KEY;
        if (!secret) return null;

        const decoded = await decode({ token: tokenCookie, secret, salt: "authjs.session-token" });
        if (decoded && decoded.role === "ADMIN") {
            return { userId: decoded.id as string, accessRole: (decoded.accessRole as string) || "owner" };
        }
        return null;
    } catch {
        return null;
    }
}
