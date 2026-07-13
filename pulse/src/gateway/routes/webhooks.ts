import { FastifyPluginAsync } from "fastify";
import { db } from "../../storage/db.js";
import { tenants } from "../../storage/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../../utils/logger.js";
import { config } from "../../config.js";

export const webhookRoutes: FastifyPluginAsync = async (fastify) => {
    // POST /webhooks/telegram/:tenantSlug              — legacy/default tenant-wide bot
    // POST /webhooks/telegram/:tenantSlug/:connectionId — per-agent bot (one bot per agent)
    const handleTelegramWebhook = async (request: any, reply: any) => {
        const { tenantSlug, connectionId } = request.params as { tenantSlug: string; connectionId?: string };
        const update = request.body; // Telegram Update object

        logger.debug({ tenantSlug, connectionId, update }, "Received Telegram webhook");

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

        // Acknowledge immediately, then process asynchronously.
        //
        // Processing can legitimately take a long time — e.g. a message from a
        // user in "requires approval" mode waits for a human to tap Allow. If we
        // held the HTTP response open for that, Telegram would time out and
        // REDELIVER the update, posting duplicate approval cards and re-running
        // side effects. Returning 200 now decouples the ack from the work.
        //
        // We also never return 5xx for an internal processing error: that would
        // make Telegram retry and duplicate the message. Errors are logged; true
        // redelivery is deduped at the queue by a stable per-message id.
        const tenantId = tenant.id;
        // connectionId scopes the lookup to a specific bot (per-agent); the tenant
        // is always re-validated from the slug above.
        void Promise.resolve()
            .then(() => telegramAdapter.handleWebhookUpdate(tenantId, update, connectionId))
            .catch((err: unknown) => logger.error({ err, tenantSlug, connectionId }, "Failed to process webhook update"));
        return reply.code(200).send({ ok: true });
    };

    fastify.post("/webhooks/telegram/:tenantSlug", handleTelegramWebhook);
    fastify.post("/webhooks/telegram/:tenantSlug/:connectionId", handleTelegramWebhook);
};
