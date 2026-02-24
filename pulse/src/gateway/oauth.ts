import { FastifyPluginAsync } from "fastify";
import { db } from "../storage/db.js";
import { oauthCodes, oauthTokens, oauthClients, tenants } from "../storage/schema.js";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";
import { z } from "zod";

export const oauthRoutes: FastifyPluginAsync = async (server) => {
    // 1. Authorize Code Generation
    // This is called by the Admin Dashboard once the user authenticates, 
    // to issue a code that the user's CLI will securely exchange.
    const authorizeSchema = z.object({
        clientId: z.string(),
        tenantId: z.string().uuid(),
        redirectUri: z.string().url().optional(),
    });

    server.post("/oauth/authorize", async (request, reply) => {
        try {
            const parsed = authorizeSchema.parse(request.body);

            const client = await db.query.oauthClients.findFirst({
                where: eq(oauthClients.clientId, parsed.clientId),
            });

            if (!client) {
                return reply.code(400).send({ error: "invalid_client" });
            }

            const code = randomBytes(32).toString("hex");
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

            await db.insert(oauthCodes).values({
                code,
                clientId: parsed.clientId,
                tenantId: parsed.tenantId,
                redirectUri: parsed.redirectUri,
                expiresAt,
            });

            return reply.send({ code });
        } catch (error) {
            server.log.error(error);
            return reply.code(400).send({ error: "invalid_request" });
        }
    });

    // 2. Token Exchange (OAuth 2.0 Standard endpoint)
    // CLIs like Claude Code and Cursor will hit this endpoint using form-urlencoded data.
    server.post("/oauth/token", async (request, reply) => {
        try {
            const body = request.body as Record<string, any>;

            // Standard OAuth 2.0 parameters
            const grant_type = body.grant_type;
            const code = body.code;
            const client_id = body.client_id;

            if (grant_type !== "authorization_code") {
                return reply.code(400).send({ error: "unsupported_grant_type" });
            }

            if (!code || !client_id) {
                return reply.code(400).send({ error: "invalid_request" });
            }

            const authCode = await db.query.oauthCodes.findFirst({
                where: and(
                    eq(oauthCodes.code, code),
                    eq(oauthCodes.clientId, client_id)
                ),
            });

            if (!authCode || authCode.expiresAt < new Date()) {
                return reply.code(400).send({ error: "invalid_grant" });
            }

            // Check if Third-Party CLI is enabled for this Tenant
            const tenant = await db.query.tenants.findFirst({
                where: eq(tenants.id, authCode.tenantId),
            });

            const config = tenant?.config as Record<string, any>;
            if (!config?.enable_third_party_cli) {
                return reply.code(403).send({
                    error: "access_denied",
                    error_description: "Third-party CLI access is disabled by your Admin."
                });
            }

            // Successfully authenticated, generate access token
            const accessToken = "pls_" + randomBytes(32).toString("hex");
            const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 Days

            await db.insert(oauthTokens).values({
                accessToken,
                clientId: client_id,
                tenantId: authCode.tenantId,
                expiresAt,
            });

            // Consume the auth code
            await db.delete(oauthCodes).where(eq(oauthCodes.id, authCode.id));

            return reply.send({
                access_token: accessToken,
                token_type: "Bearer",
                expires_in: 30 * 24 * 60 * 60, // seconds
            });
        } catch (error) {
            server.log.error(error);
            return reply.code(500).send({ error: "server_error" });
        }
    });
};
