"use server";

import { db } from "../../storage/db";
import {
    users,
    tenantProviderKeys,
    channelConnections,
    credentials,
    agentProfiles,
    workspaceRevisions,
} from "../../storage/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { encrypt } from "../../utils/crypto";
import { requireTenant } from "../../utils/tenant-auth";
import { auth } from "../../auth";
import { initializeWorkspace } from "../../utils/workspace";

// ─── Step 1: Change Password ─────────────────────────────────────────────────

export async function changePasswordOnboardingAction(formData: FormData) {
    const session = await auth();
    if (!session?.user?.id) return { success: false, message: "Not authenticated." };

    const newPassword = formData.get("newPassword") as string;
    const confirm = formData.get("confirmPassword") as string;

    if (!newPassword || newPassword.length < 8) {
        return { success: false, message: "Password must be at least 8 characters." };
    }
    if (newPassword !== confirm) {
        return { success: false, message: "Passwords do not match." };
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db
        .update(users)
        .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
        .where(eq(users.id, session.user.id));

    revalidatePath("/onboarding");
    return { success: true };
}

// ─── Step 2: Save Provider Key ───────────────────────────────────────────────

export async function validateProviderKeyOnboardingAction(formData: FormData) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { valid: false, error: tenantCheck.message };

    const provider = formData.get("provider") as string;
    const apiKey = formData.get("apiKey") as string;

    if (!provider || !apiKey) {
        return { valid: false, error: "Provider and API key are required." };
    }

    try {
        switch (provider) {
            case "anthropic": {
                const res = await fetch("https://api.anthropic.com/v1/messages", {
                    method: "POST",
                    headers: {
                        "x-api-key": apiKey,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({
                        model: "claude-sonnet-4-20250514",
                        max_tokens: 1,
                        messages: [{ role: "user", content: "hi" }],
                    }),
                });
                if (res.status === 401) return { valid: false, error: "Invalid API key." };
                return { valid: true };
            }
            case "openai": {
                const res = await fetch("https://api.openai.com/v1/models", {
                    headers: { Authorization: `Bearer ${apiKey}` },
                });
                if (res.status === 401) return { valid: false, error: "Invalid API key." };
                return { valid: true };
            }
            case "google": {
                const res = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
                );
                if (res.status === 400 || res.status === 403) return { valid: false, error: "Invalid API key." };
                return { valid: true };
            }
            case "openrouter": {
                const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
                    headers: { Authorization: `Bearer ${apiKey}` },
                });
                if (res.status === 401) return { valid: false, error: "Invalid API key." };
                return { valid: true };
            }
            default:
                return { valid: false, error: "Unknown provider." };
        }
    } catch {
        return { valid: false, error: "Validation failed. Check your connection." };
    }
}

export async function saveProviderKeyOnboardingAction(formData: FormData) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    const provider = formData.get("provider") as string;
    const apiKey = formData.get("apiKey") as string;

    if (!provider || !apiKey) {
        return { success: false, message: "Provider and API key are required." };
    }

    try {
        const encryptedApiKey = encrypt(apiKey);

        const existing = await db.query.tenantProviderKeys.findFirst({
            where: and(
                eq(tenantProviderKeys.tenantId, tenantId),
                eq(tenantProviderKeys.provider, provider)
            ),
        });

        if (existing) {
            await db
                .update(tenantProviderKeys)
                .set({
                    authMethod: "api_key",
                    encryptedApiKey,
                    isActive: true,
                    updatedAt: new Date(),
                })
                .where(eq(tenantProviderKeys.id, existing.id));
        } else {
            await db.insert(tenantProviderKeys).values({
                tenantId,
                provider,
                authMethod: "api_key",
                encryptedApiKey,
                isActive: true,
            });
        }

        revalidatePath("/onboarding");
        return { success: true, message: `${provider} key saved and encrypted.` };
    } catch {
        return { success: false, message: "Failed to save provider key." };
    }
}

// ─── Step 3: Save Telegram ───────────────────────────────────────────────────

export async function saveTelegramOnboardingAction(formData: FormData) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    const token = formData.get("botToken") as string;
    if (!token) return { success: false, message: "Bot token is required." };

    try {
        const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
        const data = await res.json();
        if (!data.ok) {
            return { success: false, message: `Telegram rejected the token: ${data.description}` };
        }

        const existing = await db
            .select()
            .from(channelConnections)
            .where(
                and(
                    eq(channelConnections.tenantId, tenantId),
                    eq(channelConnections.channelType, "telegram")
                )
            )
            .limit(1);

        if (existing.length > 0) {
            await db
                .update(channelConnections)
                .set({ channelConfig: { botToken: token }, status: "active" })
                .where(eq(channelConnections.id, existing[0].id));
        } else {
            await db.insert(channelConnections).values({
                tenantId,
                channelType: "telegram",
                channelConfig: { botToken: token },
                status: "active",
            });
        }

        revalidatePath("/onboarding");
        return { success: true, message: `Connected to @${data.result.username}` };
    } catch {
        return { success: false, message: "Failed to reach Telegram. Check your connection." };
    }
}

// ─── Step 4: Save Plugin Credentials ─────────────────────────────────────────

export async function savePluginCredentialsOnboardingAction(formData: FormData) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    const credentialName = formData.get("credentialName") as string;
    const credentialValue = formData.get("credentialValue") as string;

    if (!credentialName || !credentialValue) {
        return { success: false, message: "Credential name and value are required." };
    }

    try {
        const encryptedValue = encrypt(credentialValue);

        const existing = await db.query.credentials.findFirst({
            where: and(
                eq(credentials.tenantId, tenantId),
                eq(credentials.name, credentialName)
            ),
        });

        if (existing) {
            await db
                .update(credentials)
                .set({ encryptedValue, updatedAt: new Date() })
                .where(eq(credentials.id, existing.id));
        } else {
            await db.insert(credentials).values({
                tenantId,
                name: credentialName,
                encryptedValue,
                credentialType: "api_key",
            });
        }

        revalidatePath("/onboarding");
        return { success: true, message: `Credential "${credentialName}" saved.` };
    } catch {
        return { success: false, message: "Failed to save credential." };
    }
}

// ─── Step 5: Create First Agent ──────────────────────────────────────────────

export async function createFirstAgentAction(formData: FormData) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    const session = await auth();
    if (!session?.user?.id) return { success: false, message: "Not authenticated." };

    const name = formData.get("name") as string;
    const modelId = (formData.get("modelId") as string) || "claude-sonnet-4-20250514";
    const systemPrompt = formData.get("systemPrompt") as string;

    if (!name) {
        return { success: false, message: "Agent name is required." };
    }

    try {
        const [agent] = await db
            .insert(agentProfiles)
            .values({
                tenantId,
                name,
                systemPrompt: systemPrompt || null,
                modelId,
            })
            .returning();

        // Initialize workspace
        const workspacePath = await initializeWorkspace(
            tenantId,
            agent.id,
            systemPrompt || undefined
        );

        const soulContent =
            systemPrompt ||
            `# Soul\n\nYou are a helpful, professional AI assistant.\n`;

        await db.insert(workspaceRevisions).values([
            {
                agentProfileId: agent.id,
                tenantId,
                fileName: "SOUL.md",
                content: soulContent,
                changeSummary: "Initial workspace creation",
                changedBy: session.user.id,
                revisionNumber: 1,
            },
        ]);

        await db
            .update(agentProfiles)
            .set({ workspacePath, updatedAt: new Date() })
            .where(eq(agentProfiles.id, agent.id));

        // Auto-link telegram connection to this agent if exists
        const telegramConn = await db
            .select()
            .from(channelConnections)
            .where(
                and(
                    eq(channelConnections.tenantId, tenantId),
                    eq(channelConnections.channelType, "telegram")
                )
            )
            .limit(1);

        if (telegramConn.length > 0 && !telegramConn[0].agentProfileId) {
            await db
                .update(channelConnections)
                .set({ agentProfileId: agent.id })
                .where(eq(channelConnections.id, telegramConn[0].id));
        }

        revalidatePath("/onboarding");
        return { success: true, message: "Agent created successfully." };
    } catch {
        return { success: false, message: "Failed to create agent." };
    }
}

// ─── Step 6: Complete Onboarding ─────────────────────────────────────────────

export async function completeOnboardingAction() {
    const session = await auth();
    if (!session?.user?.id) return { success: false, message: "Not authenticated." };

    await db
        .update(users)
        .set({ onboardingComplete: true, updatedAt: new Date() })
        .where(eq(users.id, session.user.id));

    revalidatePath("/onboarding");
    return { success: true };
}
