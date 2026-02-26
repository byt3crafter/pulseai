import type { NextAuthConfig } from "next-auth";
import { config } from "./config";

export const authConfig = {
    pages: {
        signIn: "/login",
    },
    providers: [], // Providers added in auth.ts (to avoid Node.js apis on Edge backend)
    callbacks: {
        jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                token.role = user.role as string;
                token.tenantId = user.tenantId as string | null;
                token.mustChangePassword = (user as any).mustChangePassword as boolean;
            }
            return token;
        },
        session({ session, token }) {
            if (token && session.user) {
                session.user.id = token.id as string;
                session.user.role = token.role as string;
                session.user.tenantId = token.tenantId as string | null;
                session.user.mustChangePassword = token.mustChangePassword as boolean;
            }
            return session;
        },
    },
    session: {
        strategy: "jwt",
    },
    secret: config.ENCRYPTION_KEY,
} satisfies NextAuthConfig;
