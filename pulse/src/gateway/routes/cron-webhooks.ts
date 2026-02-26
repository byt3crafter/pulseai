/**
 * Cron Webhook Routes — external systems can trigger scheduled jobs via webhook.
 * POST /webhooks/cron/:webhookToken
 */

import { FastifyPluginCallback } from "fastify";
import { handleCronWebhook } from "../../cron/webhook-trigger.js";

export const cronWebhookRoutes: FastifyPluginCallback = (fastify, _opts, done) => {
    fastify.post<{ Params: { webhookToken: string } }>(
        "/webhooks/cron/:webhookToken",
        async (request, reply) => {
            const { webhookToken } = request.params;

            const result = await handleCronWebhook(webhookToken);

            if (!result.success) {
                return reply.status(404).send(result);
            }

            return reply.status(200).send(result);
        }
    );

    done();
};
