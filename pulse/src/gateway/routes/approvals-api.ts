/**
 * Approvals API — server-to-server endpoint for the dashboard Approval Center's
 * Allow / Deny / Allow-always buttons.
 *
 * Runs in the gateway (where the approval resolvers + runtime live), so a
 * decision here behaves exactly like a Telegram-card decision: it resolves any
 * waiting turn and executes an approved tool_call out-of-band, immediately. No
 * polling, nothing blocks an agent.
 *
 * Auth is two-layered: (1) the request carries the shared ADMIN_API_KEY, proving
 * it's our dashboard talking; (2) the dashboard already checked the user is an
 * authenticated workspace admin and passes the tenantId from their session —
 * decideFromDashboard verifies the approval belongs to that tenant.
 */

import { FastifyPluginAsync } from "fastify";
import crypto from "crypto";
import { decideFromDashboard } from "../../channels/approval-service.js";
import { logger } from "../../utils/logger.js";

export const approvalsApiRoutes: FastifyPluginAsync = async (fastify) => {
    const requireInternalKey = async (request: any, reply: any) => {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
            return reply.code(401).send({ error: "Authentication required" });
        }
        const adminKey = process.env.ADMIN_API_KEY;
        if (!adminKey) {
            return reply.code(503).send({ error: "Approvals API not configured" });
        }
        const token = authHeader.slice(7);
        const tokenBuf = Buffer.from(token);
        const keyBuf = Buffer.from(adminKey);
        if (tokenBuf.length !== keyBuf.length || !crypto.timingSafeEqual(tokenBuf, keyBuf)) {
            return reply.code(401).send({ error: "Invalid credentials" });
        }
    };

    // POST /api/approvals/decide  { approvalId, action, tenantId, actor }
    fastify.post("/api/approvals/decide", { preHandler: requireInternalKey }, async (request, reply) => {
        const body = (request.body || {}) as Record<string, any>;
        const approvalId = String(body.approvalId || "");
        const action = String(body.action || "");
        const tenantId = String(body.tenantId || "");
        const actor = String(body.actor || "Dashboard");

        if (!approvalId || !tenantId || !["allow", "deny", "allowall"].includes(action)) {
            return reply.code(400).send({ error: "invalid_request" });
        }

        try {
            const result = await decideFromDashboard(approvalId, action as any, tenantId, actor);
            if (!result.ok) return reply.code(409).send({ error: result.reason });
            return reply.send({ ok: true });
        } catch (err) {
            logger.error({ err, approvalId }, "Dashboard approval decision failed");
            return reply.code(500).send({ error: "server_error" });
        }
    });
};
