/**
 * Config API — admin endpoints for hot-reloadable configuration.
 * GET /api/config — current hot config
 * PATCH /api/config — merge updates
 * POST /api/config/reload — force reload from DB
 */

import { FastifyPluginAsync } from "fastify";
import { configManager } from "../../infra/config-manager.js";
import { logger } from "../../utils/logger.js";
import crypto from "crypto";

export const configApiRoutes: FastifyPluginAsync = async (fastify) => {
    const adminAuth = async (request: any, reply: any) => {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
            return reply.code(401).send({ error: "Authentication required" });
        }
        const token = authHeader.slice(7);
        const adminKey = process.env.ADMIN_API_KEY;
        if (!adminKey) {
            return reply.code(503).send({ error: "Admin API not configured" });
        }
        try {
            const tokenBuf = Buffer.from(token);
            const keyBuf = Buffer.from(adminKey);
            if (tokenBuf.length !== keyBuf.length || !crypto.timingSafeEqual(tokenBuf, keyBuf)) {
                return reply.code(401).send({ error: "Invalid credentials" });
            }
        } catch {
            return reply.code(401).send({ error: "Invalid credentials" });
        }
    };

    // GET /api/config
    fastify.get("/api/config", { preHandler: adminAuth }, async (request, reply) => {
        const config = configManager.getAll();
        const fields = Object.keys(config).map(key => ({
            key,
            value: config[key],
            restartRequired: configManager.isRestartRequired(key),
        }));

        return reply.send({
            config,
            fields,
            pollingIntervalMs: 30000,
        });
    });

    // PATCH /api/config
    fastify.patch("/api/config", { preHandler: adminAuth }, async (request, reply) => {
        const updates = request.body as Record<string, any>;

        if (!updates || typeof updates !== "object") {
            return reply.code(400).send({ error: "Request body must be a JSON object." });
        }

        const result = await configManager.patch(updates);

        return reply.send({
            success: true,
            applied: result.applied,
            restartRequired: result.restartRequired,
        });
    });

    // POST /api/config/reload
    fastify.post("/api/config/reload", { preHandler: adminAuth }, async (request, reply) => {
        await configManager.reload();
        return reply.send({
            success: true,
            config: configManager.getAll(),
        });
    });
};
