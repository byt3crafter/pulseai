import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "./storage/db";
import { users } from "./storage/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { config } from "./config";

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        Credentials({
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                console.log("\n[AUTH] === NEXTAUTH LOGIN ATTEMPT ===");
                console.log("[AUTH] Email received:", credentials?.email);

                if (!credentials?.email || !credentials?.password) {
                    console.log("[AUTH] -> Rejected: Missing email or password");
                    return null;
                }

                try {
                    const [userRecord] = await db
                        .select()
                        .from(users)
                        .where(eq(users.email, credentials.email as string))
                        .limit(1);

                    if (!userRecord) {
                        console.log("[AUTH] -> Rejected: User not found in database.");
                        return null;
                    }

                    const isValid = await bcrypt.compare(credentials.password as string, userRecord.passwordHash);

                    if (!isValid) {
                        console.log("[AUTH] -> Rejected: Invalid password.");
                        return null;
                    }

                    console.log("[AUTH] -> Approved: Login successful for", userRecord.email);
                    return {
                        id: userRecord.id,
                        name: userRecord.name,
                        email: userRecord.email,
                        role: userRecord.role,
                        tenantId: userRecord.tenantId,
                    };
                } catch (e) {
                    console.error("[AUTH] -> Exception during database query:", e);
                    return null;
                }
            },
        }),
    ],
    callbacks: {
        jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                token.role = user.role as string;
                token.tenantId = user.tenantId as string;
            }
            return token;
        },
        session({ session, token }) {
            if (token && session.user) {
                session.user.id = token.id as string;
                session.user.role = token.role as string;
                session.user.tenantId = token.tenantId as string | null;
            }
            return session;
        },
    },
    pages: {
        signIn: "/login",
    },
    session: {
        strategy: "jwt",
    },
    secret: config.ENCRYPTION_KEY,
});
