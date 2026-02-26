/**
 * OpenResponses API — POST /v1/responses
 * Compatible with OpenAI Responses API format.
 */

import { FastifyPluginAsync } from "fastify";
import { apiTokenAuth, getApiTokenContext } from "../middleware/api-token-auth.js";
import { AgentRuntime } from "../../agent/runtime.js";
import { db } from "../../storage/db.js";
import { agentProfiles } from "../../storage/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../../utils/logger.js";
import { randomUUID } from "crypto";
import { createResponseSchema, CreateResponseInput } from "./open-responses-schema.js";

export const openResponsesRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.addHook("preHandler", apiTokenAuth);

    fastify.post("/v1/responses", async (request, reply) => {
        const ctx = getApiTokenContext(request);
        if (!ctx) {
            return reply.code(401).send({ error: { message: "Unauthorized", type: "invalid_request_error" } });
        }

        if (!ctx.scopes.includes("responses")) {
            return reply.code(403).send({ error: { message: "Token missing 'responses' scope.", type: "invalid_request_error" } });
        }

        const log = logger.child({ tenantId: ctx.tenantId, route: "open-responses" });

        let body: CreateResponseInput;
        try {
            body = createResponseSchema.parse(request.body);
        } catch (err: any) {
            return reply.code(400).send({ error: { message: `Validation error: ${err.message}`, type: "invalid_request_error" } });
        }

        try {
            // Resolve agent
            let agentProfileId: string | undefined;
            const modelField = body.model || "";

            if (modelField.startsWith("pulse:")) {
                agentProfileId = modelField.slice(6);
            } else {
                const defaultProfile = await db.query.agentProfiles.findFirst({
                    where: eq(agentProfiles.tenantId, ctx.tenantId),
                });
                agentProfileId = defaultProfile?.id;
            }

            const agentRuntime: AgentRuntime = (fastify as any).agentRuntime;
            if (!agentRuntime) {
                return reply.code(503).send({ error: { message: "Agent runtime not available.", type: "api_error" } });
            }

            // Extract user content from input
            let userContent = "";
            if (typeof body.input === "string") {
                userContent = body.input;
            } else {
                const userItems = body.input.filter((item: any) => item.type === "message" && item.role === "user");
                const lastUserItem = userItems[userItems.length - 1] as any;
                userContent = lastUserItem?.content || "";
            }

            if (!userContent) {
                return reply.code(400).send({ error: { message: "No user input found.", type: "invalid_request_error" } });
            }

            const responseId = `resp_${randomUUID().replace(/-/g, "").slice(0, 24)}`;

            const inbound = {
                id: randomUUID(),
                tenantId: ctx.tenantId,
                agentProfileId,
                channelType: "api" as const,
                channelContactId: `api-${ctx.tokenId}`,
                contactName: "API Client",
                content: userContent,
                receivedAt: new Date().toISOString(),
            };

            if (body.stream) {
                reply.raw.writeHead(200, {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    Connection: "keep-alive",
                });

                // response.created event
                reply.raw.write(`data: ${JSON.stringify({ type: "response.created", response: { id: responseId, object: "response", status: "in_progress" } })}\n\n`);

                await agentRuntime.processMessage(
                    inbound,
                    async (outbound) => {
                        // Stream text deltas
                        const chunks = outbound.content.match(/.{1,50}/gs) || [outbound.content];
                        for (const chunk of chunks) {
                            reply.raw.write(`data: ${JSON.stringify({
                                type: "response.output_text.delta",
                                delta: chunk,
                            })}\n\n`);
                        }

                        // response.completed event
                        reply.raw.write(`data: ${JSON.stringify({
                            type: "response.completed",
                            response: {
                                id: responseId,
                                object: "response",
                                status: "completed",
                                output: [{
                                    type: "message",
                                    role: "assistant",
                                    content: [{ type: "output_text", text: outbound.content }],
                                }],
                            },
                        })}\n\n`);

                        reply.raw.write("data: [DONE]\n\n");
                        reply.raw.end();
                        return { channelMessageId: responseId };
                    }
                );
                return;
            }

            // Non-streaming
            let capturedContent = "";
            await agentRuntime.processMessage(
                inbound,
                async (outbound) => {
                    capturedContent = outbound.content;
                    return { channelMessageId: randomUUID() };
                }
            );

            return reply.send({
                id: responseId,
                object: "response",
                status: "completed",
                output: [{
                    type: "message",
                    role: "assistant",
                    content: [{ type: "output_text", text: capturedContent }],
                }],
                usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
            });
        } catch (err: any) {
            log.error({ err }, "Response creation failed");
            return reply.code(500).send({ error: { message: err.message || "Internal server error.", type: "api_error" } });
        }
    });
};
