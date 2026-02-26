/**
 * OpenAI-Compatible Chat Completions API
 * POST /v1/chat/completions
 * GET /v1/models
 */

import { FastifyPluginAsync } from "fastify";
import { apiTokenAuth, getApiTokenContext } from "../middleware/api-token-auth.js";
import { AgentRuntime } from "../../agent/runtime.js";
import { db } from "../../storage/db.js";
import { agentProfiles } from "../../storage/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../../utils/logger.js";
import { randomUUID } from "crypto";

interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

interface ChatCompletionRequest {
    model: string;
    messages: ChatMessage[];
    stream?: boolean;
    temperature?: number;
    max_tokens?: number;
}

export const openaiCompatRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.addHook("preHandler", apiTokenAuth);

    // POST /v1/chat/completions
    fastify.post("/v1/chat/completions", async (request, reply) => {
        const ctx = getApiTokenContext(request);
        if (!ctx) {
            return reply.code(401).send({ error: { message: "Unauthorized", type: "invalid_request_error" } });
        }

        if (!ctx.scopes.includes("chat")) {
            return reply.code(403).send({ error: { message: "Token missing 'chat' scope.", type: "invalid_request_error" } });
        }

        const body = request.body as ChatCompletionRequest;
        if (!body?.messages?.length) {
            return reply.code(400).send({ error: { message: "messages is required and must be non-empty.", type: "invalid_request_error" } });
        }

        const log = logger.child({ tenantId: ctx.tenantId, route: "openai-compat" });

        try {
            // Resolve agent: "pulse:<agentId>" or tenant default
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

            const userMessages = body.messages.filter(m => m.role !== "system");
            const lastUserMessage = userMessages[userMessages.length - 1];
            if (!lastUserMessage) {
                return reply.code(400).send({ error: { message: "No user message found.", type: "invalid_request_error" } });
            }

            const inbound = {
                id: randomUUID(),
                tenantId: ctx.tenantId,
                agentProfileId,
                channelType: "api" as const,
                channelContactId: `api-${ctx.tokenId}`,
                contactName: "API Client",
                content: lastUserMessage.content,
                receivedAt: new Date().toISOString(),
            };

            if (body.stream) {
                reply.raw.writeHead(200, {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    Connection: "keep-alive",
                });

                const completionId = `chatcmpl-${randomUUID().replace(/-/g, "").slice(0, 24)}`;

                await agentRuntime.processMessage(
                    inbound,
                    async (outbound) => {
                        const chunks = outbound.content.match(/.{1,50}/gs) || [outbound.content];
                        for (const chunk of chunks) {
                            const data = JSON.stringify({
                                id: completionId,
                                object: "chat.completion.chunk",
                                created: Math.floor(Date.now() / 1000),
                                model: body.model || "pulse-agent",
                                choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }],
                            });
                            reply.raw.write(`data: ${data}\n\n`);
                        }

                        const finalData = JSON.stringify({
                            id: completionId,
                            object: "chat.completion.chunk",
                            created: Math.floor(Date.now() / 1000),
                            model: body.model || "pulse-agent",
                            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
                        });
                        reply.raw.write(`data: ${finalData}\n\n`);
                        reply.raw.write("data: [DONE]\n\n");
                        reply.raw.end();

                        return { channelMessageId: completionId };
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

            const completionId = `chatcmpl-${randomUUID().replace(/-/g, "").slice(0, 24)}`;
            return reply.send({
                id: completionId,
                object: "chat.completion",
                created: Math.floor(Date.now() / 1000),
                model: body.model || "pulse-agent",
                choices: [{
                    index: 0,
                    message: { role: "assistant", content: capturedContent },
                    finish_reason: "stop",
                }],
                usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            });
        } catch (err: any) {
            log.error({ err }, "Chat completion failed");
            return reply.code(500).send({ error: { message: err.message || "Internal server error.", type: "api_error" } });
        }
    });

    // GET /v1/models
    fastify.get("/v1/models", async (request, reply) => {
        const ctx = getApiTokenContext(request);
        if (!ctx) {
            return reply.code(401).send({ error: { message: "Unauthorized", type: "invalid_request_error" } });
        }

        const profiles = await db.select()
            .from(agentProfiles)
            .where(eq(agentProfiles.tenantId, ctx.tenantId));

        return reply.send({
            object: "list",
            data: profiles.map(p => ({
                id: `pulse:${p.id}`,
                object: "model",
                created: Math.floor(new Date(p.createdAt!).getTime() / 1000),
                owned_by: "pulse-ai",
                name: p.name,
            })),
        });
    });
};
