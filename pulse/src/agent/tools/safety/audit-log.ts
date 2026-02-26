/**
 * Exec audit log — writes all execution decisions to the database.
 */

import { db } from "../../../storage/db.js";
import { execAuditLog } from "../../../storage/schema.js";
import { logger } from "../../../utils/logger.js";

export type ExecDecisionType = "allowed" | "denied" | "sandboxed";

export interface AuditEntry {
    tenantId: string;
    agentId?: string;
    conversationId?: string;
    command: string;
    decision: ExecDecisionType;
    reason: string;
}

/**
 * Write an audit log entry for an exec decision.
 * Non-blocking — errors are logged but don't propagate.
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
    try {
        await db.insert(execAuditLog).values({
            tenantId: entry.tenantId,
            agentId: entry.agentId || null,
            conversationId: entry.conversationId || null,
            command: entry.command,
            decision: entry.decision,
            reason: entry.reason,
        });
    } catch (err) {
        logger.error({ err, entry }, "Failed to write exec audit log");
    }
}
