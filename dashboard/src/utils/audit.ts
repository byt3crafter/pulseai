import "server-only";
import { headers } from "next/headers";
import { db } from "../storage/db";
import { auditLogs } from "../storage/schema";
import { auth } from "../auth";

/**
 * Platform audit trail. Best-effort: never throws to the caller — a failed
 * audit write must not break the action it's recording. The actor is resolved
 * from the session unless overridden (e.g. login events, where the session
 * isn't established yet).
 */
export interface AuditInput {
    action: string; // dotted verb, e.g. "tenant.create", "user.delete", "settings.provider_key.update"
    targetType?: string; // "tenant" | "user" | "settings" | "plugin" | "credential" | ...
    targetId?: string;
    summary?: string; // human-readable one-liner shown in the viewer
    tenantId?: string;
    metadata?: Record<string, unknown>;
    actor?: { id?: string; email?: string; role?: string }; // override when no session
}

export async function logAudit(input: AuditInput): Promise<void> {
    try {
        let actorId = input.actor?.id;
        let actorEmail = input.actor?.email;
        let actorRole = input.actor?.role;

        if (!actorEmail && !actorId) {
            const session = await auth().catch(() => null);
            const u = session?.user as any;
            if (u) {
                actorId = u.id;
                actorEmail = u.email;
                actorRole = u.role;
            }
        }

        let ip: string | undefined;
        try {
            const h = await headers();
            ip =
                h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                h.get("x-real-ip") ||
                undefined;
        } catch {
            /* headers() unavailable outside request scope */
        }

        await db.insert(auditLogs).values({
            tenantId: input.tenantId ?? null,
            actorId: actorId ?? null,
            actorEmail: actorEmail ?? null,
            actorRole: actorRole ?? null,
            action: input.action,
            targetType: input.targetType ?? null,
            targetId: input.targetId ?? null,
            summary: input.summary ?? null,
            metadata: (input.metadata ?? {}) as any,
            ip: ip ?? null,
        });
    } catch (error) {
        console.error("[audit] failed to record event:", input.action, error);
    }
}
