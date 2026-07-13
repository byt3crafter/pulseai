import { auth } from "../auth";
import { cookies } from "next/headers";
import { decode } from "next-auth/jwt";
import { hasPermission, type Permission } from "./permissions";

/**
 * Require an authenticated tenant (workspace-plane) user. ADMIN users with a
 * tenantId can also access workspace features. Optionally require a specific
 * tenant permission. No-arg calls only check plane membership (backward compatible).
 */
export async function requireTenant(
    permission?: Permission,
): Promise<
    | { authorized: true; tenantId: string; accessRole: string; userId: string }
    | { authorized: false; message: string }
> {
    const resolved = await resolveTenantUser();
    if (!resolved) return { authorized: false, message: "Unauthorized." };

    // Platform admins (role ADMIN) acting inside a workspace keep full access.
    const effectiveRole = resolved.isPlatform ? "owner" : resolved.accessRole;
    if (permission && !hasPermission("tenant", effectiveRole, permission)) {
        return { authorized: false, message: "You don't have permission to perform this action." };
    }
    return { authorized: true, tenantId: resolved.tenantId, accessRole: effectiveRole, userId: resolved.userId };
}

async function resolveTenantUser(): Promise<{ tenantId: string; accessRole: string; userId: string; isPlatform: boolean } | null> {
    const session = await auth();
    const u = session?.user;
    if ((u?.role === "TENANT" || u?.role === "ADMIN") && u.tenantId) {
        return {
            tenantId: u.tenantId,
            accessRole: (u as any).accessRole || "owner",
            userId: u.id,
            isPlatform: u.role === "ADMIN",
        };
    }

    try {
        const cookieStore = await cookies();
        // Auth.js derives the decryption key from (secret, salt) where salt is the
        // cookie NAME. In prod over HTTPS the cookie is the __Secure- variant, so
        // pair each cookie with its matching salt.
        const secureCookie = cookieStore.get("__Secure-authjs.session-token")?.value;
        const plainCookie = cookieStore.get("authjs.session-token")?.value;
        const tokenCookie = secureCookie || plainCookie;
        const salt = secureCookie ? "__Secure-authjs.session-token" : "authjs.session-token";
        if (!tokenCookie) return null;

        // Must match the signing secret used in auth.config.ts.
        const secret = process.env.NEXTAUTH_SECRET || process.env.ENCRYPTION_KEY;
        if (!secret) return null;

        const decoded = await decode({ token: tokenCookie, secret, salt });
        if (decoded && (decoded.role === "TENANT" || decoded.role === "ADMIN") && decoded.tenantId) {
            return {
                tenantId: decoded.tenantId as string,
                accessRole: (decoded.accessRole as string) || "owner",
                userId: decoded.id as string,
                isPlatform: decoded.role === "ADMIN",
            };
        }
        return null;
    } catch {
        return null;
    }
}
