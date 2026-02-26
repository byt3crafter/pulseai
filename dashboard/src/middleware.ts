import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { NextResponse } from "next/server";
import { isRateLimited } from "./utils/rate-limit";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
    const { nextUrl } = req;
    const isLoggedIn = !!req.auth;
    const isApiAuthRoute = nextUrl.pathname.startsWith("/api/auth");
    const isOAuthCallbackRoute = nextUrl.pathname === "/auth/callback"; // OpenAI OAuth popup callback
    const isOAuthRoute = nextUrl.pathname.startsWith("/oauth/");
    const isRoot = nextUrl.pathname === "/";
    const isLoginRoute = nextUrl.pathname === "/login";
    const isAdminLoginRoute = nextUrl.pathname === "/admin/login";

    // Rate limit POST requests to auth endpoints (login attempts)
    if (isApiAuthRoute && req.method === "POST") {
        const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
            || req.headers.get("x-real-ip")
            || "unknown";
        if (isRateLimited(ip)) {
            return new NextResponse("Too many login attempts. Please try again later.", {
                status: 429,
                headers: { "Retry-After": "60" },
            });
        }
    }

    // Always allow: API auth callbacks, OAuth popup callback, public landing, login pages
    // Login pages are always accessible — if the user is already logged in and wants
    // to switch accounts (e.g. admin → tenant), let them. A new signIn overwrites the JWT.
    if (isApiAuthRoute || isOAuthCallbackRoute || isRoot || isLoginRoute || isAdminLoginRoute) {
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
    const onboardingComplete = req.auth?.user?.onboardingComplete;
    const isOnboardingRoute = nextUrl.pathname.startsWith("/onboarding");

    // Onboarding enforcement for non-admin users
    if (userRole !== "ADMIN" && onboardingComplete === false && !isOnboardingRoute) {
        return NextResponse.redirect(new URL("/onboarding", nextUrl));
    }

    // Prevent re-entry to onboarding after completion
    if (isOnboardingRoute && onboardingComplete !== false) {
        return NextResponse.redirect(new URL("/dashboard", nextUrl));
    }

    // Allow onboarding route through (no role restriction needed — middleware already checked auth)
    if (isOnboardingRoute) {
        return NextResponse.next();
    }

    // Tenants cannot access admin panel
    if (nextUrl.pathname.startsWith("/admin") && userRole !== "ADMIN") {
        return NextResponse.redirect(new URL("/dashboard", nextUrl));
    }

    // ADMIN users can access both /dashboard and /admin — no redirect

    return NextResponse.next();
});

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
