"use server";

import { auth } from "../../../auth";
import { db } from "../../../storage/db";
import {
    mcpServers,
    agentProfileMcpBindings,
    agentProfiles,
    tenantProviderKeys,
} from "../../../storage/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { encrypt, decrypt } from "../../../utils/crypto";
import { logAudit } from "../../../utils/audit";

/**
 * MCP auth headers hold bearer tokens / API keys for the external server, so
 * they must not sit in the DB as plaintext. We wrap the AES-GCM ciphertext in
 * the existing jsonb column as `{ __enc: "<ciphertext>" }` (no migration); the
 * runtime reader decrypts it and tolerates legacy plaintext rows.
 */
function packAuthHeaders(raw: string): Record<string, string> {
    if (!raw) return {};
    return { __enc: encrypt(raw) };
}

/**
 * Confirm both the agent profile and the MCP server belong to the caller's
 * tenant. Without this, a tenant could bind its own agent to ANOTHER tenant's
 * MCP server (by id) and have its agent connect using that tenant's credentials.
 */
async function assertOwned(tenantId: string, agentProfileId: string, mcpServerId: string): Promise<boolean> {
    const [agent, server] = await Promise.all([
        db.query.agentProfiles.findFirst({
            where: and(eq(agentProfiles.id, agentProfileId), eq(agentProfiles.tenantId, tenantId)),
            columns: { id: true },
        }),
        db.query.mcpServers.findFirst({
            where: and(eq(mcpServers.id, mcpServerId), eq(mcpServers.tenantId, tenantId)),
            columns: { id: true },
        }),
    ]);
    return !!agent && !!server;
}

/**
 * The Z.ai (GLM Coding Plan) bundled MCP servers Pulse can consume. Vision is
 * deliberately excluded — it ships only as a local stdio server, which the
 * hosted gateway can't run. These are remote SSE endpoints (verified to connect
 * with a Bearer header) and are entirely optional/additive: if one fails to
 * connect at runtime the client returns null and the agent simply doesn't get
 * those tools — it can never break the rest of the toolset.
 */
const ZAI_MCP_SERVERS = [
    { name: "Z.ai Web Search", url: "https://api.z.ai/api/mcp/web_search_prime/sse" },
    { name: "Z.ai Web Reader", url: "https://api.z.ai/api/mcp/web_reader/sse" },
    { name: "Z.ai Zread (GitHub)", url: "https://api.z.ai/api/mcp/zread/sse" },
] as const;

/**
 * One-click: register the Z.ai bundled MCP servers for this tenant, authed with
 * their existing Z.ai (GLM) provider key. Idempotent — re-running updates the
 * stored key (so it also serves as "refresh after a key rotation").
 */
export async function connectZaiToolsAction() {
    const session = await auth();
    if (!session?.user?.tenantId) return { success: false, message: "Unauthorized." };
    const tenantId = session.user.tenantId;

    // Resolve the tenant's active Z.ai key (BYOK).
    const [keyRow] = await db.select({ enc: tenantProviderKeys.encryptedApiKey })
        .from(tenantProviderKeys)
        .where(and(
            eq(tenantProviderKeys.tenantId, tenantId),
            eq(tenantProviderKeys.provider, "zai"),
            eq(tenantProviderKeys.isActive, true),
        ))
        .limit(1);
    if (!keyRow?.enc) {
        return { success: false, message: "Add a Z.ai (GLM) provider key in Settings → AI Providers first." };
    }
    let apiKey: string;
    try { apiKey = decrypt(keyRow.enc); } catch { return { success: false, message: "Couldn't read the Z.ai key." }; }
    const authHeaders = packAuthHeaders(JSON.stringify({ Authorization: `Bearer ${apiKey}` }));

    try {
        let created = 0;
        let updated = 0;
        for (const svc of ZAI_MCP_SERVERS) {
            const existing = await db.query.mcpServers.findFirst({
                where: and(eq(mcpServers.tenantId, tenantId), eq(mcpServers.name, svc.name)),
            });
            if (existing) {
                await db.update(mcpServers)
                    .set({ url: svc.url, authHeaders, status: "active" })
                    .where(eq(mcpServers.id, existing.id));
                updated++;
            } else {
                await db.insert(mcpServers).values({
                    tenantId, name: svc.name, url: svc.url, authHeaders, status: "active",
                });
                created++;
            }
        }
        await logAudit({
            action: "mcp.connect_zai",
            targetType: "mcp_server",
            tenantId,
            summary: `Connected Z.ai tools (${created} new, ${updated} updated)`,
            metadata: { created, updated },
        });
        revalidatePath("/dashboard/mcp");
        return {
            success: true,
            message: `Z.ai tools connected (${created + updated}: Web Search, Web Reader, Zread). Bind them to an agent below. Note: GLM Vision isn't included — it needs a local server the hosted gateway can't run.`,
        };
    } catch (error) {
        console.error("Failed to connect Z.ai tools:", error);
        return { success: false, message: "Couldn't connect Z.ai tools. Please try again." };
    }
}

export async function createMcpServerAction(formData: FormData) {
    const session = await auth();
    if (!session?.user?.tenantId) {
        return { success: false, message: "Unauthorized." };
    }

    const name = formData.get("name") as string;
    const url = formData.get("url") as string;
    const authHeadersStr = formData.get("authHeaders") as string;

    if (!name || !url) {
        return { success: false, message: "Name and URL are required." };
    }

    if (authHeadersStr) {
        try {
            JSON.parse(authHeadersStr);
        } catch {
            return { success: false, message: "Auth headers must be valid JSON." };
        }
    }

    try {
        await db.insert(mcpServers).values({
            tenantId: session.user.tenantId,
            name,
            url,
            authHeaders: packAuthHeaders(authHeadersStr),
            status: "active",
        });

        await logAudit({
            action: "mcp.create",
            targetType: "mcp_server",
            tenantId: session.user.tenantId,
            summary: `Created MCP server ${name}`,
            metadata: { name },
        });

        revalidatePath("/dashboard/mcp");
        return { success: true, message: "MCP server created." };
    } catch (error) {
        console.error("Failed to create MCP server:", error);
        return { success: false, message: "Failed to create MCP server." };
    }
}

export async function updateMcpServerAction(formData: FormData) {
    const session = await auth();
    if (!session?.user?.tenantId) {
        return { success: false, message: "Unauthorized." };
    }

    const serverId = formData.get("serverId") as string;
    const name = formData.get("name") as string;
    const url = formData.get("url") as string;
    const authHeadersStr = formData.get("authHeaders") as string;

    if (!serverId || !name || !url) {
        return { success: false, message: "Missing required fields." };
    }

    if (authHeadersStr) {
        try {
            JSON.parse(authHeadersStr);
        } catch {
            return { success: false, message: "Auth headers must be valid JSON." };
        }
    }

    // Verify ownership
    const server = await db.query.mcpServers.findFirst({
        where: and(
            eq(mcpServers.id, serverId),
            eq(mcpServers.tenantId, session.user.tenantId)
        ),
    });

    if (!server) {
        return { success: false, message: "Server not found." };
    }

    try {
        await db
            .update(mcpServers)
            .set({ name, url, authHeaders: packAuthHeaders(authHeadersStr) })
            .where(eq(mcpServers.id, serverId));

        revalidatePath("/dashboard/mcp");
        return { success: true, message: "MCP server updated." };
    } catch (error) {
        console.error("Failed to update MCP server:", error);
        return { success: false, message: "Failed to update MCP server." };
    }
}

export async function deleteMcpServerAction(serverId: string) {
    const session = await auth();
    if (!session?.user?.tenantId) {
        return { success: false, message: "Unauthorized." };
    }

    const server = await db.query.mcpServers.findFirst({
        where: and(
            eq(mcpServers.id, serverId),
            eq(mcpServers.tenantId, session.user.tenantId)
        ),
    });

    if (!server) {
        return { success: false, message: "Server not found." };
    }

    try {
        // Cascading delete handles bindings via FK
        await db.delete(mcpServers).where(eq(mcpServers.id, serverId));

        await logAudit({
            action: "mcp.delete",
            targetType: "mcp_server",
            targetId: serverId,
            tenantId: session.user.tenantId,
            summary: `Deleted MCP server ${server.name}`,
        });

        revalidatePath("/dashboard/mcp");
        return { success: true, message: "MCP server deleted." };
    } catch (error) {
        console.error("Failed to delete MCP server:", error);
        return { success: false, message: "Failed to delete MCP server." };
    }
}

export async function bindAgentToMcpAction(
    agentProfileId: string,
    mcpServerId: string
) {
    const session = await auth();
    if (!session?.user?.tenantId) {
        return { success: false, message: "Unauthorized." };
    }

    if (!(await assertOwned(session.user.tenantId, agentProfileId, mcpServerId))) {
        return { success: false, message: "Agent or server not found." };
    }

    try {
        await db.insert(agentProfileMcpBindings).values({
            agentProfileId,
            mcpServerId,
        });
        revalidatePath("/dashboard/mcp");
        return { success: true };
    } catch (error) {
        // Likely duplicate binding
        return { success: false, message: "Binding already exists or invalid." };
    }
}

export async function unbindAgentFromMcpAction(
    agentProfileId: string,
    mcpServerId: string
) {
    const session = await auth();
    if (!session?.user?.tenantId) {
        return { success: false, message: "Unauthorized." };
    }

    if (!(await assertOwned(session.user.tenantId, agentProfileId, mcpServerId))) {
        return { success: false, message: "Agent or server not found." };
    }

    try {
        await db
            .delete(agentProfileMcpBindings)
            .where(
                and(
                    eq(agentProfileMcpBindings.agentProfileId, agentProfileId),
                    eq(agentProfileMcpBindings.mcpServerId, mcpServerId)
                )
            );
        revalidatePath("/dashboard/mcp");
        return { success: true };
    } catch (error) {
        console.error("Failed to unbind agent:", error);
        return { success: false, message: "Failed to unbind agent." };
    }
}
