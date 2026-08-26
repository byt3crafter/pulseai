import Fastify from "fastify";
import formbody from "@fastify/formbody";
import { config } from "../config.js";
import { oauthRoutes } from "./oauth.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { mcpRoutes } from "./routes/mcp.js";
import { configApiRoutes } from "./routes/config-api.js";
import { approvalsApiRoutes } from "./routes/approvals-api.js";
import { openaiCompatRoutes } from "./routes/openai-compat.js";
import { hermes3dRoutes } from "./routes/hermes3d.js";
import { openResponsesRoutes } from "./routes/open-responses.js";
import { cronWebhookRoutes } from "./routes/cron-webhooks.js";
import { adminModelsRoutes } from "./routes/admin-models.js";
import { appApiRoutes } from "./routes/app-api.js";
import { rateLimitPlugin, rateLimitConfig } from "./middleware/rate-limit.js";
import { registerWebSocket } from "./ws/ws-server.js";
import { config as appConfig } from "../config.js";
export const server = Fastify({
    logger: {
        level: config.LOG_LEVEL,
        transport:
            config.NODE_ENV === "development"
                ? {
                    target: "pino-pretty",
                    options: {
                        colorize: true,
                        translateTime: "SYS:standard",
                    },
                }
                : undefined,
    },
    disableRequestLogging: false,
});

server.register(formbody);

// Register rate limiting (must be registered before routes)
server.register(rateLimitPlugin, rateLimitConfig);

server.register(oauthRoutes);
server.register(webhookRoutes);
server.register(mcpRoutes);
server.register(configApiRoutes);
server.register(approvalsApiRoutes);
server.register(openaiCompatRoutes);
server.register(hermes3dRoutes);
server.register(openResponsesRoutes);
server.register(cronWebhookRoutes);
server.register(adminModelsRoutes);
server.register(appApiRoutes);

// WebSocket control plane (gated by env flag)
if (appConfig.GATEWAY_WS_ENABLED) {
    registerWebSocket(server);
}

server.get("/health", async (request, reply) => {
    return reply.send({ status: "ok", version: "1.0.0", uptime: process.uptime() });
});

// A hook to simulate "Bootstrapping" the server components
// Once we add the Telegram WebHook logic, it goes here.
server.addHook("onReady", async () => {
    server.log.info("Server is bootstrapping channels and tools...");
});
