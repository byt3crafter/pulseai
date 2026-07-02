import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import { db } from "../../../storage/db";
import { customTools } from "../../../storage/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "../../../utils/crypto";
import ToolsClient from "./ToolsClient";

export const dynamic = "force-dynamic";

export default async function ToolsPage() {
    const isNextBuild =
        process.env.npm_lifecycle_event === "build" ||
        process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user?.tenantId) redirect("/login");
    const tenantId = session.user.tenantId;

    const rows = await db.select().from(customTools).where(eq(customTools.tenantId, tenantId));

    const tools = rows.map((r) => {
        let headers: Record<string, string> = {};
        if (r.headersEnc) {
            try { headers = JSON.parse(decrypt(r.headersEnc)); } catch { headers = {}; }
        }
        const schema = (r.paramSchema as any) || {};
        const props = (schema.properties as Record<string, any>) || {};
        const required: string[] = (schema.required as string[]) || [];
        const params = Object.entries(props).map(([name, def]: [string, any]) => ({
            name, type: def?.type || "string", description: def?.description || "", required: required.includes(name),
        }));
        return {
            id: r.id, name: r.name, description: r.description, method: r.method,
            urlTemplate: r.urlTemplate, bodyTemplate: r.bodyTemplate || "",
            timeoutMs: r.timeoutMs, enabled: r.enabled, headers, params,
        };
    });

    return <ToolsClient tools={tools} />;
}
