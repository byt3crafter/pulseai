"use server";

import { auth } from "../../../../auth";
import { db } from "../../../../storage/db";
import { agentProfiles, workspaceRevisions, tenantProviderKeys, globalSettings, channelConnections, tenants } from "../../../../storage/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { readWorkspaceFile, writeWorkspaceFile } from "../../../../utils/workspace";
import { stripReasoning } from "../../../../utils/strip-reasoning";
import { redirect } from "next/navigation";
import { requireTenant } from "../../../../utils/tenant-auth";
import { encrypt, decrypt } from "../../../../utils/crypto";

export async function updateWorkspaceFileAction(formData: FormData) {
    const session = await auth();
    if (!session?.user?.tenantId) {
        return { success: false, message: "Unauthorized." };
    }

    const agentId = formData.get("agentId") as string;
    const fileName = formData.get("fileName") as string;
    // Defensively strip any leaked model reasoning (<think>…</think>) so it can
    // never be persisted into a persona file / systemPrompt, regardless of how
    // it got into the editor.
    const content = stripReasoning(formData.get("content") as string);
    const summary = formData.get("summary") as string;

    const ALLOWED_FILES = new Set(["SOUL.md", "IDENTITY.md", "MEMORY.md", "HEARTBEAT.md", "TOOLS.md", "USER.md", "BOOTSTRAP.md", "AGENTS.md"]);
    if (!agentId || !fileName || content === null) {
        return { success: false, message: "Missing required fields." };
    }
    if (!ALLOWED_FILES.has(fileName)) {
        return { success: false, message: "Invalid file name." };
    }

    // Verify agent belongs to tenant
    const agent = await db.query.agentProfiles.findFirst({
        where: and(
            eq(agentProfiles.id, agentId),
            eq(agentProfiles.tenantId, session.user.tenantId)
        ),
    });

    if (!agent) {
        return { success: false, message: "Agent not found." };
    }

    try {
        // Write to disk
        await writeWorkspaceFile(session.user.tenantId, agentId, fileName, content);

        // Get next revision number
        const lastRevision = await db.query.workspaceRevisions.findFirst({
            where: and(
                eq(workspaceRevisions.agentProfileId, agentId),
                eq(workspaceRevisions.fileName, fileName)
            ),
            orderBy: [desc(workspaceRevisions.revisionNumber)],
        });
        const nextRevision = (lastRevision?.revisionNumber ?? 0) + 1;

        // Record revision in DB
        await db.insert(workspaceRevisions).values({
            agentProfileId: agentId,
            tenantId: session.user.tenantId,
            fileName,
            content,
            changeSummary: summary || `Updated ${fileName}`,
            changedBy: session.user.id,
            revisionNumber: nextRevision,
        });

        // If SOUL.md, sync to legacy systemPrompt
        if (fileName === "SOUL.md") {
            await db.update(agentProfiles)
                .set({ systemPrompt: content, updatedAt: new Date() })
                .where(eq(agentProfiles.id, agentId));
        }

        revalidatePath(`/dashboard/agents/${agentId}`);
        return { success: true, message: `${fileName} saved (revision #${nextRevision}).` };
    } catch (error) {
        console.error("Failed to update workspace file:", error);
        return { success: false, message: "Failed to save file." };
    }
}

const MAX_AVATAR_BYTES = 500 * 1024;
const ALLOWED_AVATAR_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * Validate an agent avatar value before it's persisted. Accepts either:
 * - a data URL (data:image/<png|jpeg|webp>;base64,...) capped at ~500KB, or
 * - a plain https:// URL (basic sanity check only — not fetched/verified).
 * Returns the sanitized value to store, or null if invalid.
 */
function sanitizeAvatar(raw: string): { ok: true; value: string | null } | { ok: false; message: string } {
    const trimmed = raw.trim();
    if (!trimmed) return { ok: true, value: null };

    if (trimmed.startsWith("data:")) {
        const match = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=]+)$/);
        if (!match) return { ok: false, message: "Unsupported image format." };
        const [, mime, base64] = match;
        if (!ALLOWED_AVATAR_MIME.has(mime.toLowerCase())) {
            return { ok: false, message: "Avatar must be a PNG, JPEG, or WEBP image." };
        }
        // Rough byte-size estimate from base64 length (each 4 chars ≈ 3 bytes).
        const approxBytes = Math.floor((base64.length * 3) / 4);
        if (approxBytes > MAX_AVATAR_BYTES) {
            return { ok: false, message: "Avatar image must be smaller than 500KB." };
        }
        return { ok: true, value: trimmed };
    }

    try {
        const url = new URL(trimmed);
        if (url.protocol !== "https:") {
            return { ok: false, message: "Avatar URL must use https://." };
        }
        if (trimmed.length > 2048) {
            return { ok: false, message: "Avatar URL is too long." };
        }
        return { ok: true, value: trimmed };
    } catch {
        return { ok: false, message: "Invalid avatar URL." };
    }
}

/**
 * Update an agent's display identity — full name, role/title subtitle, and
 * profile picture. Shown across the dashboard (agents table, agent header).
 */
export async function updateAgentIdentityAction(formData: FormData) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    const agentId = formData.get("agentId") as string;
    const name = (formData.get("name") as string || "").trim();
    const titleRaw = (formData.get("title") as string || "").trim();
    const avatarRaw = formData.get("avatar") as string | null;
    const removeAvatar = formData.get("removeAvatar") === "true";

    if (!agentId) return { success: false, message: "Missing agent." };
    if (!name) return { success: false, message: "Name is required." };
    if (name.length > 255) return { success: false, message: "Name is too long." };
    if (titleRaw.length > 160) return { success: false, message: "Title is too long." };

    const agent = await db.query.agentProfiles.findFirst({
        where: and(eq(agentProfiles.id, agentId), eq(agentProfiles.tenantId, tenantId)),
    });
    if (!agent) return { success: false, message: "Agent not found." };

    const update: { name: string; title: string | null; avatar?: string | null; updatedAt: Date } = {
        name,
        title: titleRaw || null,
        updatedAt: new Date(),
    };

    if (removeAvatar) {
        update.avatar = null;
    } else if (avatarRaw && avatarRaw.trim()) {
        const result = sanitizeAvatar(avatarRaw);
        if (!result.ok) return { success: false, message: result.message };
        update.avatar = result.value;
    }

    try {
        await db.update(agentProfiles).set(update).where(eq(agentProfiles.id, agentId));
    } catch (error) {
        console.error("Failed to update agent identity:", error);
        return { success: false, message: "Failed to save profile." };
    }

    // Best-effort: push the new name/title to this agent's own Telegram bot so
    // it presents consistently in chats. (Bot API can set name + description;
    // the bot's PROFILE PHOTO can only be set via @BotFather — not the API.)
    await syncAgentTelegramProfile(tenantId, agentId, name, titleRaw || null);

    revalidatePath(`/dashboard/agents/${agentId}`);
    revalidatePath("/dashboard/agents");
    return { success: true, message: "Profile updated." };
}

/**
 * Sync an agent's display identity to its dedicated Telegram bot (if connected).
 * setMyName → bot name; setMyShortDescription → the role/title. Fully best-effort:
 * Telegram rate-limits setMyName (~once/hour) and rejects no-op changes, so any
 * failure is swallowed. Bot profile PHOTOS are not settable via the Bot API
 * (BotFather /setuserpic only) — intentionally not attempted here.
 */
async function syncAgentTelegramProfile(
    tenantId: string,
    agentId: string,
    name: string,
    title: string | null,
): Promise<void> {
    try {
        const conn = await db.query.channelConnections.findFirst({
            where: and(
                eq(channelConnections.tenantId, tenantId),
                eq(channelConnections.channelType, "telegram"),
                eq(channelConnections.agentProfileId, agentId),
                sql`(${channelConnections.channelConfig}->>'scope') = 'agent'`,
            ),
        });
        const raw = (conn?.channelConfig as any)?.botToken;
        if (!raw) return;
        let token: string;
        try { token = decrypt(raw); } catch { return; }

        await fetch(`https://api.telegram.org/bot${token}/setMyName`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name.slice(0, 64) }),
        }).catch(() => {});
        if (title) {
            await fetch(`https://api.telegram.org/bot${token}/setMyShortDescription`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ short_description: title.slice(0, 120) }),
            }).catch(() => {});
        }
    } catch (err) {
        console.error("Telegram profile sync skipped:", err);
    }
}

export async function updateAgentModelAction(formData: FormData) {
    const session = await auth();
    if (!session?.user?.tenantId) {
        return { success: false, message: "Unauthorized." };
    }

    const agentId = formData.get("agentId") as string;
    const modelId = formData.get("modelId") as string;

    if (!agentId || !modelId) {
        return { success: false, message: "Missing required fields." };
    }

    const agent = await db.query.agentProfiles.findFirst({
        where: and(
            eq(agentProfiles.id, agentId),
            eq(agentProfiles.tenantId, session.user.tenantId)
        ),
    });

    if (!agent) {
        return { success: false, message: "Agent not found." };
    }

    await db.update(agentProfiles)
        .set({ modelId, updatedAt: new Date() })
        .where(eq(agentProfiles.id, agentId));

    revalidatePath(`/dashboard/agents/${agentId}`);
    return { success: true, message: "Model updated." };
}

export async function getRevisionsAction(agentId: string, fileName: string) {
    const session = await auth();
    if (!session?.user?.tenantId) return [];

    const revisions = await db.select()
        .from(workspaceRevisions)
        .where(
            and(
                eq(workspaceRevisions.agentProfileId, agentId),
                eq(workspaceRevisions.fileName, fileName),
                eq(workspaceRevisions.tenantId, session.user.tenantId)
            )
        )
        .orderBy(desc(workspaceRevisions.revisionNumber));

    return revisions.map((r) => ({
        id: r.id,
        fileName: r.fileName,
        changeSummary: r.changeSummary,
        revisionNumber: r.revisionNumber,
        createdAt: r.createdAt?.toISOString() ?? "",
    }));
}

export async function restoreRevisionAction(formData: FormData) {
    const session = await auth();
    if (!session?.user?.tenantId) {
        return { success: false, message: "Unauthorized." };
    }

    const agentId = formData.get("agentId") as string;
    const revisionId = formData.get("revisionId") as string;

    if (!agentId || !revisionId) {
        return { success: false, message: "Missing required fields." };
    }

    const revision = await db.query.workspaceRevisions.findFirst({
        where: and(
            eq(workspaceRevisions.id, revisionId),
            eq(workspaceRevisions.tenantId, session.user.tenantId)
        ),
    });

    if (!revision) {
        return { success: false, message: "Revision not found." };
    }

    // Write restored content to disk
    await writeWorkspaceFile(session.user.tenantId, agentId, revision.fileName, revision.content);

    // Record new revision
    const lastRevision = await db.query.workspaceRevisions.findFirst({
        where: and(
            eq(workspaceRevisions.agentProfileId, agentId),
            eq(workspaceRevisions.fileName, revision.fileName)
        ),
        orderBy: [desc(workspaceRevisions.revisionNumber)],
    });
    const nextRevision = (lastRevision?.revisionNumber ?? 0) + 1;

    await db.insert(workspaceRevisions).values({
        agentProfileId: agentId,
        tenantId: session.user.tenantId,
        fileName: revision.fileName,
        content: revision.content,
        changeSummary: `Restored from revision #${revision.revisionNumber}`,
        changedBy: session.user.id,
        revisionNumber: nextRevision,
    });

    // Sync legacy systemPrompt if SOUL.md
    if (revision.fileName === "SOUL.md") {
        await db.update(agentProfiles)
            .set({ systemPrompt: revision.content, updatedAt: new Date() })
            .where(eq(agentProfiles.id, agentId));
    }

    revalidatePath(`/dashboard/agents/${agentId}`);
    return { success: true, message: `Restored from revision #${revision.revisionNumber}.` };
}

export async function deleteAgentAction(formData: FormData) {
    const session = await auth();
    if (!session?.user?.tenantId) {
        return { success: false, message: "Unauthorized." };
    }

    const agentId = formData.get("agentId") as string;

    if (!agentId) {
        return { success: false, message: "Missing agent ID." };
    }

    const agent = await db.query.agentProfiles.findFirst({
        where: and(
            eq(agentProfiles.id, agentId),
            eq(agentProfiles.tenantId, session.user.tenantId)
        ),
    });

    if (!agent) {
        return { success: false, message: "Agent not found." };
    }

    // Cascading delete handles workspace_revisions via FK
    await db.delete(agentProfiles).where(eq(agentProfiles.id, agentId));

    // Note: Workspace directory cleanup on disk is not critical; orphaned dirs are harmless
    revalidatePath("/dashboard/agents");
    redirect("/dashboard/agents");
}

/**
 * Get the list of provider IDs that have active API keys for the current tenant.
 * Checks: 1) tenant BYOK keys, 2) global admin keys from global_settings.
 * Env var fallback (tier 3) is backend-only and not checked here.
 */
export async function getActiveProvidersAction(): Promise<string[]> {
    const session = await auth();
    if (!session?.user?.tenantId) return [];

    const activeProviders = new Set<string>();

    // Tier 1: Tenant-specific BYOK keys.
    // OpenAI connected via ChatGPT OAuth only (no API key) is EXCLUDED from
    // model selection: the OpenAI API rejects ChatGPT tokens, so its models
    // could never run — showing them just produces broken agents.
    const tenantKeys = await db.select({
        provider: tenantProviderKeys.provider,
        authMethod: tenantProviderKeys.authMethod,
        encryptedApiKey: tenantProviderKeys.encryptedApiKey,
    })
        .from(tenantProviderKeys)
        .where(
            and(
                eq(tenantProviderKeys.tenantId, session.user.tenantId),
                eq(tenantProviderKeys.isActive, true)
            )
        );

    for (const key of tenantKeys) {
        if (key.provider === "openai" && (key.authMethod !== "api_key" || !key.encryptedApiKey)) continue;
        activeProviders.add(key.provider);
    }

    // Codex runs on the host's ChatGPT subscription (keyless) — always offered.
    // TODO: admin gate / per-tenant CODEX_HOME before multi-tenant use.
    activeProviders.add("codex");

    // Tier 2: Global admin-configured keys
    const rootSettings = await db.query.globalSettings.findFirst({
        where: eq(globalSettings.id, "root"),
    });

    if (rootSettings?.anthropicApiKeyHash) activeProviders.add("anthropic");
    if (rootSettings?.openaiApiKeyHash) activeProviders.add("openai");

    return Array.from(activeProviders);
}

export async function updateToolPolicyAction(formData: FormData) {
    const session = await auth();
    if (!session?.user?.tenantId) {
        return { success: false, message: "Unauthorized." };
    }

    const agentId = formData.get("agentId") as string;
    const allowStr = formData.get("allow") as string;
    const denyStr = formData.get("deny") as string;

    if (!agentId) {
        return { success: false, message: "Missing required fields." };
    }

    const agent = await db.query.agentProfiles.findFirst({
        where: and(
            eq(agentProfiles.id, agentId),
            eq(agentProfiles.tenantId, session.user.tenantId)
        ),
    });

    if (!agent) {
        return { success: false, message: "Agent not found." };
    }

    const parseList = (str: string) => {
        if (!str || !str.trim()) return [];
        return str.split(",").map((s) => s.trim()).filter(Boolean);
    };

    const toolPolicy = {
        allow: parseList(allowStr || ""),
        deny: parseList(denyStr || ""),
    };

    await db.update(agentProfiles)
        .set({ toolPolicy, updatedAt: new Date() })
        .where(eq(agentProfiles.id, agentId));

    revalidatePath(`/dashboard/agents/${agentId}`);
    return { success: true, message: "Tool policy updated." };
}

export async function updateSandboxConfigAction(formData: FormData) {
    const session = await auth();
    if (!session?.user?.tenantId) {
        return { success: false, message: "Unauthorized." };
    }

    const agentId = formData.get("agentId") as string;
    if (!agentId) return { success: false, message: "Missing required fields." };

    const agent = await db.query.agentProfiles.findFirst({
        where: and(
            eq(agentProfiles.id, agentId),
            eq(agentProfiles.tenantId, session.user.tenantId)
        ),
    });

    if (!agent) return { success: false, message: "Agent not found." };

    const sandboxConfig = {
        mode: formData.get("mode") || "off",
        scope: formData.get("scope") || "session",
        workspaceAccess: formData.get("workspaceAccess") || "none",
        docker: {
            image: formData.get("image") || undefined,
            memoryLimit: formData.get("memoryLimit") || undefined,
            cpuLimit: formData.get("cpuLimit") || undefined,
            setupCommand: formData.get("setupCommand") || undefined,
        }
    };

    await db.update(agentProfiles)
        .set({ sandboxConfig, updatedAt: new Date() })
        .where(eq(agentProfiles.id, agentId));

    revalidatePath(`/dashboard/agents/${agentId}`);
    return { success: true, message: "Sandbox configuration saved." };
}

export async function updateHeartbeatConfigAction(formData: FormData) {
    const session = await auth();
    if (!session?.user?.tenantId) return { success: false, message: "Unauthorized." };

    const agentId = formData.get("agentId") as string;
    if (!agentId) return { success: false, message: "Missing required fields." };

    const agent = await db.query.agentProfiles.findFirst({
        where: and(eq(agentProfiles.id, agentId), eq(agentProfiles.tenantId, session.user.tenantId))
    });

    if (!agent) return { success: false, message: "Agent not found." };

    const heartbeatConfig = {
        enabled: formData.get("enabled") === "true",
        every: parseInt(formData.get("every") as string) || 3600,
        activeHours: {
            enabled: formData.get("activeHoursEnabled") === "true",
            start: formData.get("activeHoursStart") as string || "09:00",
            end: formData.get("activeHoursEnd") as string || "17:00",
            timezone: formData.get("activeHoursTimezone") as string || "UTC"
        }
    };

    await db.update(agentProfiles)
        .set({ heartbeatConfig, updatedAt: new Date() })
        .where(eq(agentProfiles.id, agentId));

    revalidatePath(`/dashboard/agents/${agentId}`);
    return { success: true, message: "Heartbeat configuration saved. Note: It may take up to 60 seconds to reload the scheduler." };
}

export async function updateSelfConfigAction(formData: FormData) {
    const session = await auth();
    if (!session?.user?.tenantId) {
        return { success: false, message: "Unauthorized." };
    }

    const agentId = formData.get("agentId") as string;
    const enabled = formData.get("enabled") === "true";

    if (!agentId) return { success: false, message: "Missing required fields." };

    const agent = await db.query.agentProfiles.findFirst({
        where: and(eq(agentProfiles.id, agentId), eq(agentProfiles.tenantId, session.user.tenantId))
    });

    if (!agent) return { success: false, message: "Agent not found." };

    await db.update(agentProfiles)
        .set({ selfConfigEnabled: enabled, updatedAt: new Date() })
        .where(eq(agentProfiles.id, agentId));

    revalidatePath(`/dashboard/agents/${agentId}`);
    return { success: true, message: enabled ? "Self-config enabled." : "Self-config disabled." };
}

export async function updateAgentSkillConfigAction(formData: FormData) {
    "use server";
    const session = await auth();
    if (!session?.user?.tenantId) return { success: false, message: "Unauthorized." };

    const agentId = formData.get("agentId") as string;
    const skillConfigRaw = formData.get("skillConfig") as string;

    if (!agentId || !skillConfigRaw) return { success: false, message: "Missing required fields." };

    let skillConfig: any;
    try {
        skillConfig = JSON.parse(skillConfigRaw);
    } catch {
        return { success: false, message: "Invalid skill configuration." };
    }

    const agent = await db.query.agentProfiles.findFirst({
        where: and(eq(agentProfiles.id, agentId), eq(agentProfiles.tenantId, session.user.tenantId))
    });

    if (!agent) return { success: false, message: "Agent not found." };

    await db.update(agentProfiles)
        .set({ skillConfig, updatedAt: new Date() })
        .where(eq(agentProfiles.id, agentId));

    revalidatePath(`/dashboard/agents/${agentId}`);
    return { success: true, message: "Skill configuration saved." };
}

export async function updateAgentEmailConfigAction(formData: FormData) {
    "use server";
    const session = await auth();
    if (!session?.user?.tenantId) return { success: false, message: "Unauthorized." };

    const agentId = formData.get("agentId") as string;
    const emailConfigRaw = formData.get("emailConfig") as string;

    if (!agentId || !emailConfigRaw) return { success: false, message: "Missing required fields." };

    let emailConfig: any;
    try {
        emailConfig = JSON.parse(emailConfigRaw);
    } catch {
        return { success: false, message: "Invalid email configuration." };
    }

    const agent = await db.query.agentProfiles.findFirst({
        where: and(eq(agentProfiles.id, agentId), eq(agentProfiles.tenantId, session.user.tenantId))
    });

    if (!agent) return { success: false, message: "Agent not found." };

    await db.update(agentProfiles)
        .set({ emailConfig, updatedAt: new Date() })
        .where(eq(agentProfiles.id, agentId));

    revalidatePath(`/dashboard/agents/${agentId}`);
    return { success: true, message: "Email configuration saved." };
}

/**
 * Connect (or update) a dedicated Telegram bot for one agent. Stored as its own
 * channel_connections row — tagged channelConfig.scope = "agent" — separate
 * from the tenant-wide default bot managed by Settings → Telegram
 * (saveTelegramTokenAction), so the two never collide or overwrite each other.
 */
export async function saveAgentTelegramBotAction(formData: FormData) {
    const tenantCheck = await requireTenant("tenant.settings.write");
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    const agentId = formData.get("agentId") as string;
    const token = (formData.get("telegramToken") as string || "").trim();
    if (!agentId) return { success: false, message: "Missing agent." };
    if (!token) return { success: false, message: "Bot token is required." };

    const agent = await db.query.agentProfiles.findFirst({
        where: and(eq(agentProfiles.id, agentId), eq(agentProfiles.tenantId, tenantId)),
    });
    if (!agent) return { success: false, message: "Agent not found." };

    try {
        const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
        const data = await res.json();
        if (!data.ok) return { success: false, message: `Telegram rejected the token: ${data.description}` };

        const botUsername = data.result?.username as string | undefined;
        const encryptedToken = encrypt(token);

        const existing = await db.select().from(channelConnections)
            .where(and(
                eq(channelConnections.tenantId, tenantId),
                eq(channelConnections.channelType, "telegram"),
                eq(channelConnections.agentProfileId, agentId),
                sql`(${channelConnections.channelConfig}->>'scope') = 'agent'`
            )).limit(1);

        let connectionId: string;
        if (existing.length > 0) {
            connectionId = existing[0].id;
            await db.update(channelConnections)
                .set({
                    channelConfig: { botToken: encryptedToken, scope: "agent", botUsername },
                    status: "active",
                    agentProfileId: agentId,
                })
                .where(eq(channelConnections.id, connectionId));
        } else {
            const [inserted] = await db.insert(channelConnections).values({
                tenantId,
                channelType: "telegram",
                channelConfig: { botToken: encryptedToken, scope: "agent", botUsername },
                status: "active",
                agentProfileId: agentId,
            }).returning();
            connectionId = inserted.id;
        }

        // Register the webhook for this specific connection — no gateway restart
        // needed, the gateway lazy-loads the bot on its first inbound webhook hit.
        const webhookBase = process.env.WEBHOOK_BASE_URL;
        if (webhookBase) {
            try {
                const [t] = await db.select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
                if (t?.slug) {
                    const webhookUrl = `${webhookBase.replace(/\/$/, "")}/webhooks/telegram/${t.slug}/${connectionId}`;
                    const wh = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            url: webhookUrl,
                            drop_pending_updates: false,
                            ...(process.env.TELEGRAM_WEBHOOK_SECRET ? { secret_token: process.env.TELEGRAM_WEBHOOK_SECRET } : {}),
                        }),
                    });
                    const whData = await wh.json().catch(() => ({}));
                    if (!whData.ok) {
                        console.error("Telegram setWebhook failed:", whData.description);
                        revalidatePath(`/dashboard/agents/${agentId}`);
                        return {
                            success: true,
                            message: `Connected to @${botUsername}, but webhook setup failed — messages may not arrive until the gateway restarts.`,
                        };
                    }
                }
            } catch (e) {
                console.error("Telegram setWebhook error:", e);
                revalidatePath(`/dashboard/agents/${agentId}`);
                return { success: true, message: `Connected to @${botUsername} (webhook will activate on next gateway restart).` };
            }
        }

        // Name the bot after the agent immediately (best-effort).
        await syncAgentTelegramProfile(tenantId, agentId, agent.name, (agent as any).title ?? null);

        revalidatePath(`/dashboard/agents/${agentId}`);
        return { success: true, message: `Connected to @${botUsername} — it now responds as ${agent.name}.` };
    } catch {
        return { success: false, message: "Failed to reach Telegram. Check your connection." };
    }
}

/** Disconnect this agent's dedicated Telegram bot (does not touch the tenant-wide default bot). */
export async function disconnectAgentTelegramBotAction(formData: FormData) {
    const tenantCheck = await requireTenant("tenant.settings.write");
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    const agentId = formData.get("agentId") as string;
    if (!agentId) return { success: false, message: "Missing agent." };

    const agent = await db.query.agentProfiles.findFirst({
        where: and(eq(agentProfiles.id, agentId), eq(agentProfiles.tenantId, tenantId)),
    });
    if (!agent) return { success: false, message: "Agent not found." };

    const existing = await db.select().from(channelConnections)
        .where(and(
            eq(channelConnections.tenantId, tenantId),
            eq(channelConnections.channelType, "telegram"),
            eq(channelConnections.agentProfileId, agentId),
            sql`(${channelConnections.channelConfig}->>'scope') = 'agent'`
        )).limit(1);

    if (existing.length === 0) {
        return { success: true, message: "No Telegram bot connected for this agent." };
    }

    const conn = existing[0];
    try {
        const cfg = conn.channelConfig as any;
        if (cfg?.botToken) {
            const token = decrypt(cfg.botToken);
            await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, { method: "POST" }).catch(() => {});
        }
    } catch (e) {
        console.error("Failed to delete Telegram webhook on disconnect:", e);
    }

    await db.update(channelConnections)
        .set({ status: "disabled" })
        .where(eq(channelConnections.id, conn.id));

    revalidatePath(`/dashboard/agents/${agentId}`);
    return { success: true, message: "Telegram bot disconnected." };
}

