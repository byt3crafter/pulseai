import type { NextAuthConfig } from "next-auth";

// Read secret directly from process.env to avoid importing config.ts,
// which validates DATABASE_URL, ANTHROPIC_API_KEY, etc. and throws in Edge runtime
// (middleware) where those env vars may not be available.
const authSecret = process.env.ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || "";

export const authConfig = {
    pages: {
        signIn: "/login",
    },
    providers: [], // Providers added in auth.ts (to avoid Node.js apis on Edge backend)
    callbacks: {
        jwt({ token, user }) {
            if (user) {
                token.id = user.id!;
                token.role = user.role as string;
                token.tenantId = user.tenantId as string | null;
                token.mustChangePassword = (user as any).mustChangePassword as boolean;
                token.onboardingComplete = (user as any).onboardingComplete as boolean;
            }
            return token;
        },
        session({ session, token }) {
            if (token && session.user) {
                session.user.id = token.id as string;
                session.user.role = token.role as string;
                session.user.tenantId = token.tenantId as string | null;
                session.user.mustChangePassword = token.mustChangePassword as boolean;
                session.user.onboardingComplete = token.onboardingComplete as boolean;
            }
            return session;
        },
    },
    session: {
        strategy: "jwt",
    },
    secret: authSecret,
} satisfies NextAuthConfig;
