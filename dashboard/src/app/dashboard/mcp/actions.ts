"use server";

import { auth } from "../../../auth";
import { db } from "../../../storage/db";
import {
    mcpServers,
    agentProfileMcpBindings,
    agentProfiles,
} from "../../../storage/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { encrypt } from "../../../utils/crypto";

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
