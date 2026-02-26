import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { NextResponse } from "next/server";

export const { auth: middleware } = NextAuth(authConfig);

export default middleware((req) => {
    const { nextUrl } = req;
    const isLoggedIn = !!req.auth;
    const isApiAuthRoute = nextUrl.pathname.startsWith("/api/auth");
    const isOAuthCallbackRoute = nextUrl.pathname === "/auth/callback"; // OpenAI OAuth popup callback
    const isOAuthRoute = nextUrl.pathname.startsWith("/oauth/");
    const isRoot = nextUrl.pathname === "/";
    const isLoginRoute = nextUrl.pathname === "/login";
    const isAdminLoginRoute = nextUrl.pathname === "/admin/login";

    // Always allow: API auth callbacks, OAuth popup callback, public landing, tenant login, admin login
    if (isApiAuthRoute || isOAuthCallbackRoute || isRoot || isLoginRoute || isAdminLoginRoute) {
        // If already logged in and trying to access a login page, redirect to the right dashboard
        if (isLoggedIn && (isLoginRoute || isAdminLoginRoute)) {
            if (req.auth?.user?.role === "ADMIN") {
                return NextResponse.redirect(new URL("/admin", nextUrl));
            } else {
                return NextResponse.redirect(new URL("/dashboard", nextUrl));
            }
        }
        return NextResponse.next();
    }

    // OAuth consent page: requires login, but skip role-based redirects
    if (isOAuthRoute) {
        if (!isLoggedIn) {
            // Redirect to login, preserving the OAuth URL as callback
            const loginUrl = new URL("/login", nextUrl);
            loginUrl.searchParams.set("callbackUrl", nextUrl.href);
            return NextResponse.redirect(loginUrl);
        }
        return NextResponse.next();
    }

    // Unauthenticated: redirect to the right login page
    if (!isLoggedIn) {
        if (nextUrl.pathname.startsWith("/admin")) {
            return NextResponse.redirect(new URL("/admin/login", nextUrl));
        }
        return NextResponse.redirect(new URL("/login", nextUrl));
    }

    // From here: user IS authenticated
    const userRole = req.auth?.user?.role;
    const mustChangePassword = req.auth?.user?.mustChangePassword;

    // Force password change before accessing dashboard (redirect to Settings → Account tab)
    const isSettingsRoute = nextUrl.pathname.startsWith("/dashboard/settings");
    if (userRole === "TENANT" && mustChangePassword && !isSettingsRoute) {
        return NextResponse.redirect(new URL("/dashboard/settings?tab=account&forcePasswordChange=true", nextUrl));
    }

    // Tenants cannot access admin panel
    if (nextUrl.pathname.startsWith("/admin") && userRole !== "ADMIN") {
        return NextResponse.redirect(new URL("/dashboard", nextUrl));
    }

    // Admins are isolated to /admin
    if (nextUrl.pathname.startsWith("/dashboard") && userRole === "ADMIN") {
        return NextResponse.redirect(new URL("/admin", nextUrl));
    }

    return NextResponse.next();
});

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
