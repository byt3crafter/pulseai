import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "./storage/db";
import { users } from "./storage/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";
import { resolveSso, provisionSsoUser } from "./utils/sso";
import { checkSecondFactor } from "./utils/totp";
import { decrypt } from "./utils/crypto";

function credentialsProvider() {
    return Credentials({
        credentials: {
            email: { label: "Email", type: "email" },
            password: { label: "Password", type: "password" },
            loginType: { label: "Login Type", type: "text" },
            totp: { label: "2FA Code", type: "text" },
        },
        async authorize(credentials) {
            if (!credentials?.email || !credentials?.password) {
                return null;
            }

            const loginType = (credentials.loginType as string) || "";

            try {
                const [userRecord] = await db
                    .select()
                    .from(users)
                    .where(eq(users.email, credentials.email as string))
                    .limit(1);

                if (!userRecord) {
                    return null;
                }

                const isValid = await bcrypt.compare(credentials.password as string, userRecord.passwordHash);

                if (!isValid) {
                    return null;
                }

                // Enforce login page/role separation
                if (loginType === "tenant" && userRecord.role === "ADMIN") {
                    return null;
                }
                if (loginType === "admin" && userRecord.role !== "ADMIN") {
                    return null;
                }

                // Two-factor: if enabled, require a valid TOTP code OR a one-time
                // recovery code (which is consumed on use).
                if ((userRecord as any).twoFactorEnabled) {
                    const code = (credentials.totp as string) || "";
                    let secret: string | null = null;
                    try {
                        secret = (userRecord as any).twoFactorSecret ? decrypt((userRecord as any).twoFactorSecret) : null;
                    } catch {
                        secret = null;
                    }
                    const backup = Array.isArray((userRecord as any).twoFactorBackupCodes)
                        ? ((userRecord as any).twoFactorBackupCodes as string[])
                        : [];
                    const check = checkSecondFactor(secret, backup, code);
                    if (!check.ok) return null;
                    if (check.viaBackup) {
                        await db.update(users)
                            .set({ twoFactorBackupCodes: check.remaining })
                            .where(eq(users.id, userRecord.id));
                    }
                }

                // Update last login timestamp
                await db.update(users)
                    .set({ lastLoginAt: new Date() })
                    .where(eq(users.id, userRecord.id));

                return {
                    id: userRecord.id,
                    name: userRecord.name,
                    email: userRecord.email,
                    role: userRecord.role,
                    accessRole: (userRecord as any).accessRole || "owner",
                    tenantId: userRecord.tenantId,
                    mustChangePassword: userRecord.mustChangePassword,
                    onboardingComplete: userRecord.onboardingComplete,
                };
            } catch (e) {
                console.error("[AUTH] Login failed due to internal error");
                return null;
            }
        },
    });
}

export const { handlers, signIn, signOut, auth, unstable_update } = NextAuth(async () => {
    // Build providers dynamically: Credentials always; OIDC only when an admin
    // has configured + enabled SSO (so default behavior is unchanged).
    const sso = await resolveSso().catch(() => null);
    const providers: any[] = [credentialsProvider()];
    if (sso) {
        providers.push({
            id: "sso",
            name: sso.name,
            type: "oidc",
            issuer: sso.issuer,
            clientId: sso.clientId,
            clientSecret: sso.clientSecret,
            authorization: { params: { scope: "openid email profile" } },
            allowDangerousEmailAccountLinking: true,
        });
    }

    return {
        ...authConfig,
        providers,
        callbacks: {
            ...authConfig.callbacks,
            async jwt({ token, user, account, profile, trigger, session }) {
                // OIDC sign-in → JIT-provision the Pulse user and stamp the token.
                if (account?.provider === "sso" && profile) {
                    const prov = await provisionSsoUser(profile as Record<string, unknown>);
                    if (prov) {
                        token.id = prov.id;
                        token.role = prov.role;
                        (token as any).accessRole = prov.accessRole;
                        token.tenantId = prov.tenantId;
                        token.mustChangePassword = false;
                        token.onboardingComplete = true;
                        token.email = (profile.email as string) ?? token.email;
                        token.name = (profile.name as string) ?? token.name;
                    }
                    return token;
                }

                // Delegate to base callback for credentials sign-in (sets all token
                // fields) and to fold in session updates (trigger === "update").
                //
                // NOTE: we deliberately do NOT re-read onboardingComplete from the DB
                // here. This Node callback and the Edge middleware (auth.config.ts,
                // which cannot touch the DB) must agree on the SAME cookie value —
                // otherwise Node reports "complete", the onboarding page redirects to
                // /dashboard, the Edge middleware still sees "incomplete" and bounces
                // back to /onboarding → infinite redirect loop. The cookie is refreshed
                // authoritatively via unstable_update() in completeOnboardingAction.
                const result = authConfig.callbacks!.jwt!({ token, user, trigger, session } as any);
                const tok = result instanceof Promise ? await result : result;
                return tok;
            },
        },
    };
});
