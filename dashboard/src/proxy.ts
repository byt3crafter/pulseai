import { auth } from "./auth"
import { NextResponse } from "next/server"

export default auth((req) => {
    const isLoggedIn = !!req.auth;
    const isAuthRoute = req.nextUrl.pathname.startsWith('/login');
    const role = req.auth?.user?.role;

    // Protect Super Admin routes
    if (req.nextUrl.pathname.startsWith('/admin')) {
        if (!isLoggedIn) return NextResponse.redirect(new URL('/login', req.nextUrl));
        if (role !== 'ADMIN') {
            // Tenants trying to access Admin space get bounced to their dashboard
            return NextResponse.redirect(new URL('/dashboard', req.nextUrl));
        }
    }

    // Protect Customer Dashboard routes
    if (req.nextUrl.pathname.startsWith('/dashboard')) {
        if (!isLoggedIn) return NextResponse.redirect(new URL('/login', req.nextUrl));
    }

    // Prevent logged-in users from seeing the login page
    if (isAuthRoute && isLoggedIn) {
        return NextResponse.redirect(new URL('/', req.nextUrl));
    }

    return NextResponse.next();
})

export const config = {
    // Match all routes except static assets and standard API routes
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
