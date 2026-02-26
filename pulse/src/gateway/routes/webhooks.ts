import { FastifyPluginAsync } from "fastify";
import { db } from "../../storage/db.js";
import { tenants } from "../../storage/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../../utils/logger.js";
import { config } from "../../config.js";

export const webhookRoutes: FastifyPluginAsync = async (fastify) => {
    // POST /webhooks/telegram/:tenantSlug
    fastify.post("/webhooks/telegram/:tenantSlug", async (request, reply) => {
        const { tenantSlug } = request.params as { tenantSlug: string };
        const update = request.body; // Telegram Update object

        logger.debug({ tenantSlug, update }, "Received Telegram webhook");

        // Lookup tenant by slug
        const tenant = await db.query.tenants.findFirst({
            where: eq(tenants.slug, tenantSlug),
        });

        if (!tenant) {
            logger.warn({ tenantSlug }, "Tenant not found for webhook");
            return reply.code(404).send({ error: "Tenant not found" });
        }

        // Validate Telegram webhook secret token
        if (config.TELEGRAM_WEBHOOK_SECRET) {
            const secretHeader = request.headers["x-telegram-bot-api-secret-token"] as string | undefined;
            if (secretHeader !== config.TELEGRAM_WEBHOOK_SECRET) {
                logger.warn({ tenantSlug }, "Webhook secret mismatch");
                return reply.code(401).send({ error: "Unauthorized" });
            }
        }

        // Get Telegram adapter and process update
        const telegramAdapter = (fastify as any).telegramAdapter;
        if (!telegramAdapter) {
            logger.error("Telegram adapter not found");
            return reply.code(500).send({ error: "Internal server error" });
        }

        try {
            await telegramAdapter.handleWebhookUpdate(tenant.id, update);
            return reply.code(200).send({ ok: true });
        } catch (err) {
            logger.error({ err, tenantSlug }, "Failed to process webhook");
            return reply.code(500).send({ error: "Failed to process webhook" });
        }
    });

    // GET /webhooks/telegram/:tenantSlug/info - Debug endpoint to check webhook status
    fastify.get("/webhooks/telegram/:tenantSlug/info", async (request, reply) => {
        const { tenantSlug } = request.params as { tenantSlug: string };

        const tenant = await db.query.tenants.findFirst({
            where: eq(tenants.slug, tenantSlug),
        });

        if (!tenant) {
            return reply.code(404).send({ error: "Tenant not found" });
        }

        const telegramAdapter = (fastify as any).telegramAdapter;
        if (!telegramAdapter) {
            return reply.code(500).send({ error: "Telegram adapter not available" });
        }

        try {
            const webhookInfo = await telegramAdapter.getWebhookInfo(tenant.id);
            return reply.send(webhookInfo);
        } catch (err) {
            logger.error({ err, tenantSlug }, "Failed to get webhook info");
            return reply.code(500).send({ error: "Failed to get webhook info" });
        }
    });
};
