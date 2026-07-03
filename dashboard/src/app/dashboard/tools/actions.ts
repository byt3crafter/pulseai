"use server";

import { db } from "../../../storage/db";
import { customTools, agentProfiles } from "../../../storage/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireTenant } from "../../../utils/tenant-auth";
import { encrypt } from "../../../utils/crypto";

const PATH = "/dashboard/tools";
type Result = { success: boolean; message: string };

type ParamDef = { name: string; type: string; description?: string; required?: boolean };

function buildParamSchema(params: ParamDef[]) {
    const properties: Record<string, any> = {};
    const required: string[] = [];
    for (const p of params) {
        if (!p.name?.trim()) continue;
        const t = ["string", "number", "boolean"].includes(p.type) ? p.type : "string";
        properties[p.name.trim()] = { type: t, ...(p.description ? { description: p.description } : {}) };
        if (p.required) required.push(p.name.trim());
    }
    return { properties, required };
}

// Validate a tool name: snake_case-ish, safe for the LLM tool namespace.
function normalizeName(raw: string): string | null {
    const n = (raw || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
    if (!n || n.length > 64) return null;
    return n;
}

export async function saveCustomToolAction(formData: FormData): Promise<Result> {
    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };
    const tenantId = check.tenantId;

    const toolId = (formData.get("toolId") as string) || "";
    const name = normalizeName(formData.get("name") as string);
    const description = ((formData.get("description") as string) || "").trim();
    const method = (formData.get("method") as string || "GET").toUpperCase();
    const urlTemplate = ((formData.get("urlTemplate") as string) || "").trim();
    const bodyTemplate = ((formData.get("bodyTemplate") as string) || "").trim() || null;
    const timeoutMs = Math.min(30000, Math.max(1000, parseInt((formData.get("timeoutMs") as string) || "15000", 10) || 15000));

    if (!name) return { success: false, message: "A valid tool name is required (letters, numbers, underscores)." };
    if (!description) return { success: false, message: "A description is required — the AI uses it to decide when to call the tool." };
    if (!/^https?:\/\//i.test(urlTemplate)) return { success: false, message: "URL must start with http:// or https://" };
    if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) return { success: false, message: "Invalid method." };

    let params: ParamDef[] = [];
    let headers: Record<string, string> = {};
    let allowedAgentIds: string[] = [];
    try { params = JSON.parse((formData.get("paramsJson") as string) || "[]"); } catch { /* ignore */ }
    try { headers = JSON.parse((formData.get("headersJson") as string) || "{}"); } catch { /* ignore */ }
    try { allowedAgentIds = JSON.parse((formData.get("allowedAgentIdsJson") as string) || "[]"); } catch { /* ignore */ }

    // Only keep agent ids that actually belong to this tenant.
    if (allowedAgentIds.length) {
        const owned = await db.select({ id: agentProfiles.id })
            .from(agentProfiles).where(eq(agentProfiles.tenantId, tenantId));
        const ownedSet = new Set(owned.map((a) => a.id));
        allowedAgentIds = allowedAgentIds.filter((id) => ownedSet.has(id));
    }
    const paramSchema = buildParamSchema(params);
    const cleanHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) if (k?.trim()) cleanHeaders[k.trim()] = String(v ?? "");
    const headersEnc = Object.keys(cleanHeaders).length ? encrypt(JSON.stringify(cleanHeaders)) : null;

    try {
        if (toolId) {
            const [existing] = await db.select({ id: customTools.id })
                .from(customTools).where(and(eq(customTools.id, toolId), eq(customTools.tenantId, tenantId))).limit(1);
            if (!existing) return { success: false, message: "Not found." };
            await db.update(customTools)
                .set({ name, description, method, urlTemplate, bodyTemplate, paramSchema, allowedAgentIds, timeoutMs, headersEnc, updatedAt: new Date() })
                .where(and(eq(customTools.id, toolId), eq(customTools.tenantId, tenantId)));
        } else {
            await db.insert(customTools).values({ tenantId, name, description, method, urlTemplate, bodyTemplate, paramSchema, allowedAgentIds, timeoutMs, headersEnc });
        }
        revalidatePath(PATH);
        return { success: true, message: "Saved." };
    } catch (error) {
        console.error("Failed to save custom tool:", error);
        return { success: false, message: "Could not save — the tool name may already be in use." };
    }
}

export async function deleteCustomToolAction(formData: FormData): Promise<Result> {
    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };
    const toolId = formData.get("toolId") as string;
    try {
        await db.delete(customTools).where(and(eq(customTools.id, toolId), eq(customTools.tenantId, check.tenantId)));
        revalidatePath(PATH);
        return { success: true, message: "Deleted." };
    } catch (error) {
        console.error("Failed to delete custom tool:", error);
        return { success: false, message: "Could not delete it." };
    }
}

export async function toggleCustomToolAction(formData: FormData): Promise<Result> {
    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };
    const toolId = formData.get("toolId") as string;
    const enabled = formData.get("enabled") === "true";
    try {
        await db.update(customTools).set({ enabled, updatedAt: new Date() })
            .where(and(eq(customTools.id, toolId), eq(customTools.tenantId, check.tenantId)));
        revalidatePath(PATH);
        return { success: true, message: enabled ? "Enabled." : "Disabled." };
    } catch (error) {
        console.error("Failed to toggle custom tool:", error);
        return { success: false, message: "Could not update it." };
    }
}
