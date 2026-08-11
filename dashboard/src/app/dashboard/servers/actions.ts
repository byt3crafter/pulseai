"use server";

import { db } from "../../../storage/db";
import { servers, agentProfiles } from "../../../storage/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireTenant } from "../../../utils/tenant-auth";
import { encrypt, decrypt } from "../../../utils/crypto";
import { testSshConnection } from "../../../utils/ssh-test";
import { logAudit } from "../../../utils/audit";

const PATH = "/dashboard/servers";
type Result = { success: boolean; message: string };

const ENVIRONMENTS = ["production", "staging", "dev"] as const;
const SAFETY_MODES = ["observe", "safe", "full"] as const;
const APPROVAL_MODES = ["off", "writes", "all"] as const;

function normalizePort(raw: FormDataEntryValue | null): number {
    const n = parseInt((raw as string) || "22", 10);
    if (!Number.isFinite(n) || n < 1 || n > 65535) return 22;
    return n;
}

export async function saveServerAction(formData: FormData): Promise<Result> {
    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };
    const tenantId = check.tenantId;

    const serverId = (formData.get("serverId") as string) || "";
    const name = ((formData.get("name") as string) || "").trim();
    const host = ((formData.get("host") as string) || "").trim();
    const port = normalizePort(formData.get("port"));
    const username = ((formData.get("username") as string) || "").trim();
    const authType = (formData.get("authType") as string) === "password" ? "password" : "key";
    const secretInput = (formData.get("secret") as string) || "";
    const environment = ENVIRONMENTS.includes(formData.get("environment") as any)
        ? (formData.get("environment") as string)
        : "dev";
    const safetyMode = SAFETY_MODES.includes(formData.get("safetyMode") as any)
        ? (formData.get("safetyMode") as string)
        : "observe";
    const approvalMode = APPROVAL_MODES.includes(formData.get("approvalMode") as any)
        ? (formData.get("approvalMode") as string)
        : "off";
    const instructions = ((formData.get("instructions") as string) || "").trim() || null;
    const enabled = formData.get("enabled") === "true";
    const riskAcknowledged = formData.get("riskAcknowledged") === "true";

    if (!name) return { success: false, message: "A server name is required." };
    if (!host) return { success: false, message: "A host is required." };
    if (!username) return { success: false, message: "A username is required." };

    // Production + full safety mode disables all guardrails — require explicit confirmation.
    if (environment === "production" && safetyMode === "full" && !riskAcknowledged) {
        return {
            success: false,
            message: "Check 'I understand the risk' to enable full access on a production server.",
        };
    }

    let allowedAgentIds: string[] = [];
    try {
        allowedAgentIds = JSON.parse((formData.get("allowedAgentIdsJson") as string) || "[]");
    } catch {
        allowedAgentIds = [];
    }
    if (allowedAgentIds.length) {
        const owned = await db
            .select({ id: agentProfiles.id })
            .from(agentProfiles)
            .where(eq(agentProfiles.tenantId, tenantId));
        const ownedSet = new Set(owned.map((a) => a.id));
        allowedAgentIds = allowedAgentIds.filter((id) => ownedSet.has(id));
    }

    try {
        if (serverId) {
            const [existing] = await db
                .select({ id: servers.id, encryptedSecret: servers.encryptedSecret })
                .from(servers)
                .where(and(eq(servers.id, serverId), eq(servers.tenantId, tenantId)))
                .limit(1);
            if (!existing) return { success: false, message: "Server not found." };

            // Secret is write-only: blank input on edit means "keep the existing value".
            const encryptedSecret = secretInput ? encrypt(secretInput) : existing.encryptedSecret;

            await db
                .update(servers)
                .set({
                    name,
                    host,
                    port,
                    username,
                    authType,
                    encryptedSecret,
                    environment,
                    safetyMode,
                    instructions,
                    allowedAgentIds,
                    approvalMode,
                    enabled,
                    updatedAt: new Date(),
                })
                .where(and(eq(servers.id, serverId), eq(servers.tenantId, tenantId)));
        } else {
            if (!secretInput) return { success: false, message: "A password or private key is required." };
            await db.insert(servers).values({
                tenantId,
                name,
                host,
                port,
                username,
                authType,
                encryptedSecret: encrypt(secretInput),
                environment,
                safetyMode,
                instructions,
                allowedAgentIds,
                approvalMode,
                enabled,
            });
        }

        await logAudit({
            action: "server.save",
            targetType: "server",
            targetId: serverId || undefined,
            tenantId,
            summary: `Saved server ${name}`,
            metadata: { name, host },
        });

        revalidatePath(PATH);
        return { success: true, message: "Saved." };
    } catch (error) {
        console.error("Failed to save server:", error);
        return { success: false, message: "Could not save the server — please try again." };
    }
}

export async function deleteServerAction(formData: FormData): Promise<Result> {
    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };
    const serverId = (formData.get("serverId") as string) || "";
    try {
        await db.delete(servers).where(and(eq(servers.id, serverId), eq(servers.tenantId, check.tenantId)));

        await logAudit({
            action: "server.delete",
            targetType: "server",
            targetId: serverId,
            tenantId: check.tenantId,
            summary: "Deleted server",
        });

        revalidatePath(PATH);
        return { success: true, message: "Deleted." };
    } catch (error) {
        console.error("Failed to delete server:", error);
        return { success: false, message: "Could not delete it." };
    }
}

export async function toggleServerEnabledAction(serverId: string, enabled: boolean): Promise<Result> {
    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };
    if (!serverId) return { success: false, message: "Missing server id." };
    try {
        const res = await db
            .update(servers)
            .set({ enabled, updatedAt: new Date() })
            .where(and(eq(servers.id, serverId), eq(servers.tenantId, check.tenantId)))
            .returning({ id: servers.id });
        if (!res.length) return { success: false, message: "Server not found." };

        await logAudit({
            action: "server.toggle_enabled",
            targetType: "server",
            targetId: serverId,
            tenantId: check.tenantId,
            summary: enabled ? "Enabled server" : "Disabled server",
            metadata: { enabled },
        });

        revalidatePath(PATH);
        return { success: true, message: enabled ? "Enabled." : "Disabled." };
    } catch (error) {
        console.error("Failed to toggle server:", error);
        return { success: false, message: "Could not update it." };
    }
}

export async function testServerConnectionAction(formData: FormData): Promise<Result> {
    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };
    const tenantId = check.tenantId;

    const serverId = (formData.get("serverId") as string) || "";
    const host = ((formData.get("host") as string) || "").trim();
    const port = normalizePort(formData.get("port"));
    const username = ((formData.get("username") as string) || "").trim();
    const authType = (formData.get("authType") as string) === "password" ? "password" : "key";
    let secret = (formData.get("secret") as string) || "";

    if (!host || !username) return { success: false, message: "Host and username are required to test the connection." };

    if (!secret && serverId) {
        try {
            const [existing] = await db
                .select({ encryptedSecret: servers.encryptedSecret })
                .from(servers)
                .where(and(eq(servers.id, serverId), eq(servers.tenantId, tenantId)))
                .limit(1);
            if (!existing) return { success: false, message: "Server not found." };
            secret = decrypt(existing.encryptedSecret);
        } catch (error) {
            console.error("Failed to load server secret for test:", error);
            return { success: false, message: "Could not read the saved credentials." };
        }
    }

    if (!secret) {
        return {
            success: false,
            message: authType === "key" ? "A private key is required to test the connection." : "A password is required to test the connection.",
        };
    }

    const result = await testSshConnection({ host, port, username, authType, secret });
    if (result.ok) {
        return { success: true, message: `Connected in ${result.latencyMs}ms — uptime: ${result.output || "(no output)"}` };
    }
    return { success: false, message: result.message };
}
