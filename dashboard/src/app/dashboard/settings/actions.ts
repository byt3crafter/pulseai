"use server";

import { auth, signIn } from "../../../auth";
import { db } from "../../../storage/db";
import { users, channelConnections, tenantProviderKeys, tenants, allowlists, pairingCodes, agentProfiles, apiTokens } from "../../../storage/schema";
import { eq, and, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { encrypt } from "../../../utils/crypto";
import crypto from "crypto";

export async function changePasswordAction(formData: FormData) {
    const session = await auth();
    if (!session?.user?.id) return { success: false, message: "Not authenticated." };

    const current = formData.get("currentPassword") as string;
    const newPassword = formData.get("newPassword") as string;
    const confirm = formData.get("confirmPassword") as string;

    // Fetch current user
    const [user] = await db.select()
        .from(users).where(eq(users.id, session.user.id)).limit(1);

    if (!user) return { success: false, message: "User not found." };

    // Verify current password (unless it's a forced change from temp password)
    if (!session.user.mustChangePassword) {
        const valid = await bcrypt.compare(current, user.passwordHash);
        if (!valid) return { success: false, message: "Current password is incorrect." };
    }

    if (newPassword.length < 8) return { success: false, message: "Password must be at least 8 characters." };
    if (newPassword !== confirm) return { success: false, message: "Passwords do not match." };

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.update(users)
        .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
        .where(eq(users.id, session.user.id));

    // If forced password change, re-authenticate to refresh the JWT cookie
    // with mustChangePassword=false, then redirect to dashboard seamlessly
    if (session.user.mustChangePassword) {
        await signIn("credentials", {
            email: session.user.email,
            password: newPassword,
            redirectTo: "/dashboard",
        });
        // signIn redirects — this line won't execute
    }

    revalidatePath("/dashboard/settings");
    return { success: true, message: "Password updated successfully." };
}

export async function saveTelegramTokenAction(formData: FormData) {
    const session = await auth();
    if (!session?.user?.tenantId) return { success: false, message: "No tenant context." };

    const token = formData.get("telegramToken") as string;
    if (!token) return { success: false, message: "Bot token is required." };

    try {
        const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
        const data = await res.json();
        if (!data.ok) return { success: false, message: `Telegram rejected the token: ${data.description}` };

        // Auto-link the tenant's agent profile to the channel connection
        const agentProfile = await db.select({ id: agentProfiles.id })
            .from(agentProfiles)
            .where(eq(agentProfiles.tenantId, session.user.tenantId!))
            .limit(1);
        const agentProfileId = agentProfile[0]?.id ?? null;

        const existing = await db.select().from(channelConnections)
            .where(eq(channelConnections.tenantId, session.user.tenantId!)).limit(1);

        if (existing.length > 0) {
            await db.update(channelConnections)
                .set({ channelConfig: { botToken: token }, status: "active", agentProfileId })
                .where(eq(channelConnections.id, existing[0].id));
        } else {
            await db.insert(channelConnections).values({
                tenantId: session.user.tenantId!,
                channelType: "telegram",
                channelConfig: { botToken: token },
                status: "active",
                agentProfileId,
            });
        }

        return { success: true, message: `Connected to @${data.result.username}` };
    } catch {
        return { success: false, message: "Failed to reach Telegram. Check your connection." };
    }
}

// ─── Provider Key Actions ────────────────────────────────────────────────────

export async function saveProviderKeyAction(formData: FormData) {
    const session = await auth();
    if (!session?.user?.tenantId) return { success: false, message: "No tenant context." };

    const provider = formData.get("provider") as string;
    const apiKey = formData.get("apiKey") as string;
    const alias = formData.get("alias") as string;
    const authMethod = (formData.get("authMethod") as string) || "api_key";

    if (!provider || !apiKey) {
        return { success: false, message: "Provider and API key are required." };
    }

    // Validate setup tokens
    if (authMethod === "setup_token") {
        if (!apiKey.startsWith("sk-ant-oat01-")) {
            return { success: false, message: "Setup token must start with sk-ant-oat01-" };
        }
        if (apiKey.length < 80) {
            return { success: false, message: "Setup token appears too short. Run `claude setup-token` to generate a valid token." };
        }
    }

    // Validate OAuth tokens — just ensure non-empty (format varies by provider)
    if (authMethod === "oauth") {
        if (apiKey.trim().length < 10) {
            return { success: false, message: "OAuth token appears too short." };
        }
    }

    try {
        const encryptedApiKey = encrypt(apiKey);

        const existing = await db.query.tenantProviderKeys.findFirst({
            where: and(
                eq(tenantProviderKeys.tenantId, session.user.tenantId!),
                eq(tenantProviderKeys.provider, provider)
            ),
        });

        if (existing) {
            await db.update(tenantProviderKeys)
                .set({
                    authMethod,
                    encryptedApiKey,
                    keyAlias: alias || null,
                    isActive: true,
                    updatedAt: new Date(),
                })
                .where(eq(tenantProviderKeys.id, existing.id));
        } else {
            await db.insert(tenantProviderKeys).values({
                tenantId: session.user.tenantId!,
                provider,
                authMethod,
                encryptedApiKey,
                keyAlias: alias || null,
                isActive: true,
            });
        }

        revalidatePath("/dashboard/settings");
        const label = authMethod === "setup_token" ? "setup token" : authMethod === "oauth" ? "token" : "key";
        return { success: true, message: `${provider} ${label} saved and encrypted.` };
    } catch (error) {
        console.error("Failed to save provider key:", error);
        return { success: false, message: "Failed to save key." };
    }
}

export async function removeProviderKeyAction(formData: FormData) {
    const session = await auth();
    if (!session?.user?.tenantId) return { success: false, message: "No tenant context." };

    const provider = formData.get("provider") as string;
    if (!provider) return { success: false, message: "Provider is required." };

    try {
        await db.delete(tenantProviderKeys)
            .where(
                and(
                    eq(tenantProviderKeys.tenantId, session.user.tenantId!),
                    eq(tenantProviderKeys.provider, provider)
                )
            );

        revalidatePath("/dashboard/settings");
        return { success: true, message: `${provider} key removed.` };
    } catch (error) {
        console.error("Failed to remove provider key:", error);
        return { success: false, message: "Failed to remove key." };
    }
}

export async function validateProviderKeyAction(formData: FormData) {
    const session = await auth();
    if (!session?.user?.tenantId) return { valid: false, error: "Unauthorized." };

    const provider = formData.get("provider") as string;
    const apiKey = formData.get("apiKey") as string;
    const authMethod = (formData.get("authMethod") as string) || "api_key";

    if (!provider || !apiKey) {
        return { valid: false, error: "Provider and API key are required." };
    }

    try {
        switch (provider) {
            case "anthropic": {
                const headers: Record<string, string> = {
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                };
                if (authMethod === "setup_token") {
                    headers["Authorization"] = `Bearer ${apiKey}`;
                } else {
                    headers["x-api-key"] = apiKey;
                }
                const res = await fetch("https://api.anthropic.com/v1/messages", {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        model: "claude-sonnet-4-20250514",
                        max_tokens: 1,
                        messages: [{ role: "user", content: "hi" }],
                    }),
                });

                if (res.status === 401) {
                    const body = await res.json().catch(() => ({}));
                    const detail = body?.error?.message || "";
                    return {
                        valid: false, error: authMethod === "setup_token"
                            ? `Invalid setup token${detail ? `: ${detail}` : ""}`
                            : `Invalid API key${detail ? `: ${detail}` : ""}`
                    };
                }
                if (res.status === 403) {
                    const body = await res.json().catch(() => ({}));
                    const detail = body?.error?.message || "";
                    if (authMethod === "setup_token") {
                        // 403 for setup tokens = token accepted but access restricted
                        return { valid: false, error: `Token authenticated but access denied${detail ? `: ${detail}` : ". Your subscription may not cover this model."}` };
                    }
                    return { valid: false, error: `API key rejected${detail ? `: ${detail}` : ""}` };
                }
                // 200 or 400 (bad request) both mean auth succeeded
                return { valid: true };
            }
            case "openai": {
                const res = await fetch("https://api.openai.com/v1/models", {
                    headers: { Authorization: `Bearer ${apiKey}` },
                });
                if (res.status === 401) {
                    return { valid: false, error: authMethod === "oauth" ? "Invalid token" : "Invalid API key" };
                }
                return { valid: true };
            }
            case "google": {
                const res = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
                );
                if (res.status === 400 || res.status === 403) {
                    return { valid: false, error: "Invalid API key" };
                }
                return { valid: true };
            }
            case "openrouter": {
                const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
                    headers: { Authorization: `Bearer ${apiKey}` },
                });
                if (res.status === 401) {
                    return { valid: false, error: "Invalid API key" };
                }
                return { valid: true };
            }
            default:
                return { valid: false, error: `Unknown provider: ${provider}` };
        }
    } catch {
        return { valid: false, error: "Validation failed" };
    }
}

// ─── OAuth / CLI Toggle Action ──────────────────────────────────────────────

export async function toggleCliAccessAction(enabled: boolean) {
    const session = await auth();
    if (!session?.user?.tenantId) return { success: false, message: "No tenant context." };

    try {
        const config = JSON.stringify({ enable_third_party_cli: enabled });
        await db.execute(
            sql`UPDATE tenants SET config = config || ${config}::jsonb, updated_at = now() WHERE id = ${session.user.tenantId}::uuid`
        );

        revalidatePath("/dashboard/settings");
        return { success: true };
    } catch (error) {
        console.error("Failed to toggle CLI access:", error);
        return { success: false, message: "Failed to update setting." };
    }
}

// ─── Telegram Policy Actions ────────────────────────────────────────────────

export async function updateTelegramPoliciesAction(config: {
    telegram_dm_policy: string;
    telegram_group_policy: string;
    telegram_require_mention: boolean;
}) {
    const session = await auth();
    if (!session?.user?.tenantId) return { success: false, message: "No tenant context." };

    try {
        await db.execute(
            sql`UPDATE tenants SET config = config || ${JSON.stringify(config)}::jsonb, updated_at = now() WHERE id = ${session.user.tenantId}::uuid`
        );

        revalidatePath("/dashboard/settings");
        return { success: true };
    } catch (error) {
        console.error("Failed to update telegram policies:", error);
        return { success: false, message: "Failed to save Telegram policies." };
    }
}

export async function approvePairingAction(code: string) {
    const session = await auth();
    if (!session?.user?.tenantId) return { success: false, message: "No tenant context." };

    const tenantId = session.user.tenantId;

    try {
        const record = await db.query.pairingCodes.findFirst({
            where: and(
                eq(pairingCodes.tenantId, tenantId),
                eq(pairingCodes.code, code),
                eq(pairingCodes.status, "pending")
            ),
        });

        if (!record) return { success: false, message: "Pairing code not found or already processed." };

        await db.update(pairingCodes).set({ status: "approved" }).where(eq(pairingCodes.id, record.id));

        await db.update(allowlists).set({ status: "approved" }).where(
            and(
                eq(allowlists.tenantId, tenantId),
                eq(allowlists.channelType, "telegram"),
                eq(allowlists.contactId, record.contactId)
            )
        );

        revalidatePath("/dashboard/settings");
        return { success: true };
    } catch (error) {
        console.error("Failed to approve pairing:", error);
        return { success: false, message: "Failed to approve." };
    }
}

export async function rejectPairingAction(contactId: string) {
    const session = await auth();
    if (!session?.user?.tenantId) return { success: false, message: "No tenant context." };

    try {
        await db.update(allowlists).set({ status: "blocked" }).where(
            and(
                eq(allowlists.tenantId, session.user.tenantId),
                eq(allowlists.channelType, "telegram"),
                eq(allowlists.contactId, contactId)
            )
        );

        await db.update(pairingCodes).set({ status: "rejected" }).where(
            and(
                eq(pairingCodes.tenantId, session.user.tenantId),
                eq(pairingCodes.contactId, contactId),
                eq(pairingCodes.status, "pending")
            )
        );

        revalidatePath("/dashboard/settings");
        return { success: true };
    } catch (error) {
        console.error("Failed to reject pairing:", error);
        return { success: false, message: "Failed to reject." };
    }
}

export async function addGroupToAllowlistAction(groupChatId: string, groupName: string) {
    const session = await auth();
    if (!session?.user?.tenantId) return { success: false, message: "No tenant context." };

    try {
        await db.insert(allowlists).values({
            tenantId: session.user.tenantId,
            channelType: "telegram",
            contactId: groupChatId,
            contactName: groupName,
            contactType: "group",
            status: "approved",
        });

        revalidatePath("/dashboard/settings");
        return { success: true };
    } catch (error) {
        if (error instanceof Error && error.message.includes("unique")) {
            return { success: false, message: "This group is already in the allowlist." };
        }
        console.error("Failed to add group:", error);
        return { success: false, message: "Failed to add group." };
    }
}

// ─── OpenAI OAuth Code Exchange ──────────────────────────────────────────────
//
// Two-step flow matching Codex CLI (codex-rs/login/src/server.rs):
//   Step 1: auth code → id_token + access_token + refresh_token
//   Step 2: id_token → OpenAI API key (sk-...) via token-exchange grant
//
// The resulting sk-... key is what resolveKey() uses for API calls.

export async function exchangeOpenAICodeAction({
    code,
    codeVerifier,
    redirectUri,
}: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
}) {
    const session = await auth();
    if (!session?.user?.tenantId) return { success: false, message: "No tenant context." };

    const OPENAI_TOKEN_URL = "https://auth.openai.com/oauth/token";
    const OPENAI_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

    try {
        // ── Step 1: Exchange authorization code for tokens ──
        const tokenRes = await fetch(OPENAI_TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                code,
                redirect_uri: redirectUri,
                client_id: OPENAI_CLIENT_ID,
                code_verifier: codeVerifier,
            }),
        });

        const tokenData = await tokenRes.json();

        if (!tokenRes.ok || !tokenData.access_token) {
            const detail = tokenData.error_description
                || (typeof tokenData.error === "object" ? tokenData.error?.message : tokenData.error)
                || "Token exchange failed";
            return { success: false, message: String(detail) };
        }

        const { access_token, refresh_token } = tokenData;

        // The access_token from Step 1 IS the OpenAI API credential.
        // No Step 2 needed — this matches pi-ai's loginOpenAICodex() which
        // returns access_token directly as the API key (no token-exchange grant).
        const openaiApiKey = access_token;

        // ── Validate the access token against OpenAI ──
        const validateRes = await fetch("https://api.openai.com/v1/models", {
            headers: { Authorization: `Bearer ${openaiApiKey}` },
        });

        if (validateRes.status === 401) {
            return { success: false, message: "The access token was rejected by OpenAI. Your ChatGPT subscription may not include API access." };
        }

        // ── Encrypt and store ──
        const encryptedApiKey = encrypt(openaiApiKey);
        const encryptedRefreshToken = refresh_token ? encrypt(refresh_token) : null;

        // Parse JWT claims: expiry, account ID, and granted scopes
        let expiresAt: Date | null = null;
        let chatgptAccountId: string | null = null;
        let grantedScopes: string | null = null;
        try {
            const payload = access_token.split(".")[1];
            const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
            if (claims.exp) expiresAt = new Date(claims.exp * 1000);
            // Extract account ID from custom claims (used by Codex CLI)
            const authClaim = claims["https://api.openai.com/auth"];
            if (authClaim?.chatgpt_account_id) {
                chatgptAccountId = authClaim.chatgpt_account_id;
            }
            if (claims.scope) grantedScopes = claims.scope;
        } catch { /* ignore parse errors */ }

        const existing = await db.query.tenantProviderKeys.findFirst({
            where: and(
                eq(tenantProviderKeys.tenantId, session.user.tenantId!),
                eq(tenantProviderKeys.provider, "openai")
            ),
        });

        const values = {
            authMethod: "oauth",
            encryptedApiKey,
            oauthAccessTokenEnc: encrypt(access_token),
            oauthRefreshTokenEnc: encryptedRefreshToken,
            oauthTokenExpiresAt: expiresAt,
            oauthClientId: OPENAI_CLIENT_ID,
            keyAlias: chatgptAccountId
                ? `ChatGPT (${chatgptAccountId.substring(0, 8)})`
                : "ChatGPT Subscription",
            isActive: true,
            updatedAt: new Date(),
        };

        if (existing) {
            await db.update(tenantProviderKeys)
                .set(values)
                .where(eq(tenantProviderKeys.id, existing.id));
        } else {
            await db.insert(tenantProviderKeys).values({
                tenantId: session.user.tenantId!,
                provider: "openai",
                ...values,
            });
        }

        revalidatePath("/dashboard/settings");
        return { success: true, message: "ChatGPT account connected successfully." };
    } catch (error) {
        console.error("OpenAI OAuth exchange failed:", error);
        return { success: false, message: "OAuth exchange failed." };
    }
}

export async function removeFromAllowlistAction(contactId: string) {
    const session = await auth();
    if (!session?.user?.tenantId) return { success: false, message: "No tenant context." };

    try {
        await db.delete(allowlists).where(
            and(
                eq(allowlists.tenantId, session.user.tenantId),
                eq(allowlists.channelType, "telegram"),
                eq(allowlists.contactId, contactId)
            )
        );

        revalidatePath("/dashboard/settings");
        return { success: true };
    } catch (error) {
        console.error("Failed to remove from allowlist:", error);
        return { success: false, message: "Failed to remove." };
    }
}

// ─── API Tokens (OpenAI-compatible HTTP API) ─────────────────────────────────

export async function generateApiTokenAction(formData: FormData) {
    const session = await auth();
    if (!session?.user?.tenantId) return { success: false, message: "Unauthorized." };

    const name = formData.get("name") as string || "API Token";

    // Generate a random 32-byte hex token, prefix with 'pulse-sk-'
    const rawSecret = crypto.randomBytes(32).toString("hex");
    const rawToken = `pulse-sk-${rawSecret}`;

    // Hash it for storage
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    await db.insert(apiTokens).values({
        tenantId: session.user.tenantId,
        tokenHash,
        name,
        scopes: ["chat", "responses"],
    });

    revalidatePath("/dashboard/settings");
    return { success: true, token: rawToken, message: "Token generated successfully." };
}

export async function revokeApiTokenAction(tokenId: string) {
    const session = await auth();
    if (!session?.user?.tenantId) return { success: false, message: "Unauthorized." };

    await db.delete(apiTokens).where(
        and(
            eq(apiTokens.id, tokenId),
            eq(apiTokens.tenantId, session.user.tenantId)
        )
    );

    revalidatePath("/dashboard/settings");
    return { success: true, message: "Token revoked." };
}
