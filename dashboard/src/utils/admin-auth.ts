import { auth } from "../auth";
import { cookies } from "next/headers";
import { decode } from "next-auth/jwt";

/**
 * Reliably check if the current request is from an authenticated admin.
 * Falls back to decoding the session JWT cookie when auth() returns null
 * (known issue with NextAuth v5 in certain server action contexts).
 */
export async function requireAdmin(): Promise<{ authorized: true; userId: string } | { authorized: false; message: string }> {
    // Try the standard auth() first
    const session = await auth();
    if (session?.user?.role === "ADMIN") {
        return { authorized: true, userId: session.user.id };
    }

    // Fallback: manually decode the JWT from the session cookie
    try {
        const cookieStore = await cookies();
        const tokenCookie =
            cookieStore.get("authjs.session-token")?.value ||
            cookieStore.get("__Secure-authjs.session-token")?.value;

        if (!tokenCookie) {
            return { authorized: false, message: "Unauthorized." };
        }

        const secret = process.env.ENCRYPTION_KEY;
        if (!secret) {
            return { authorized: false, message: "Unauthorized." };
        }

        const decoded = await decode({ token: tokenCookie, secret, salt: "authjs.session-token" });

        if (decoded && decoded.role === "ADMIN") {
            return { authorized: true, userId: decoded.id as string };
        }

        return { authorized: false, message: "Unauthorized." };
    } catch {
        return { authorized: false, message: "Unauthorized." };
    }
}
