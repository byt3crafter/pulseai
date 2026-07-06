import { auth } from "../../../../../auth";
import { redirect, notFound } from "next/navigation";
import { db } from "../../../../../storage/db";
import { customTools, agentProfiles } from "../../../../../storage/schema";
import { and, eq } from "drizzle-orm";
import { decrypt } from "../../../../../utils/crypto";
import ToolEditor from "../../ToolEditor";

export const dynamic = "force-dynamic";

export default async function EditToolPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const isNextBuild =
        process.env.npm_lifecycle_event === "build" ||
        process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user?.tenantId) redirect("/login");
    const tenantId = session.user.tenantId;

    const [row] = await db.select().from(customTools)
        .where(and(eq(customTools.id, id), eq(customTools.tenantId, tenantId)))
        .limit(1);
    if (!row) return notFound();

    const agents = await db.select({ id: agentProfiles.id, name: agentProfiles.name })
        .from(agentProfiles)
        .where(eq(agentProfiles.tenantId, tenantId));

    let headers: Record<string, string> = {};
    if (row.headersEnc) {
        try { headers = JSON.parse(decrypt(row.headersEnc)); } catch { headers = {}; }
    }
    const schema = (row.paramSchema as any) || {};
    const props = (schema.properties as Record<string, any>) || {};
    const required: string[] = (schema.required as string[]) || [];
    const paramList = Object.entries(props).map(([name, def]: [string, any]) => ({
        name, type: def?.type || "string", description: def?.description || "", required: required.includes(name),
    }));

    const tool = {
        id: row.id,
        name: row.name,
        description: row.description,
        method: row.method,
        urlTemplate: row.urlTemplate,
        bodyTemplate: row.bodyTemplate || "",
        timeoutMs: row.timeoutMs,
        enabled: row.enabled,
        headers,
        params: paramList,
        allowedAgentIds: Array.isArray(row.allowedAgentIds) ? (row.allowedAgentIds as string[]) : [],
    };

    return <ToolEditor agents={agents} tool={tool} />;
}
