/**
 * Config API — admin endpoints for hot-reloadable configuration.
 * GET /api/config — current hot config
 * PATCH /api/config — merge updates
 * POST /api/config/reload — force reload from DB
 */

import { FastifyPluginAsync } from "fastify";
import { configManager } from "../../infra/config-manager.js";
import { logger } from "../../utils/logger.js";

export const configApiRoutes: FastifyPluginAsync = async (fastify) => {
    // Simple admin auth check — reuse existing patterns
    // In production, this should validate an admin session/token
    const adminAuth = async (request: any, reply: any) => {
        const authHeader = request.headers.authorization;
        // Accept API token auth or admin header
        if (!authHeader) {
            reply.code(401).send({ error: "Authentication required" });
            return;
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
