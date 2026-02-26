"use server";

import { auth } from "../../../auth";
import { db } from "../../../storage/db";
import {
    mcpServers,
    agentProfileMcpBindings,
} from "../../../storage/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

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

    let authHeaders = {};
    if (authHeadersStr) {
        try {
            authHeaders = JSON.parse(authHeadersStr);
        } catch {
            return { success: false, message: "Auth headers must be valid JSON." };
        }
    }

    try {
        await db.insert(mcpServers).values({
            tenantId: session.user.tenantId,
            name,
            url,
            authHeaders,
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

    let authHeaders = {};
    if (authHeadersStr) {
        try {
            authHeaders = JSON.parse(authHeadersStr);
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
            .set({ name, url, authHeaders })
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
