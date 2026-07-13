import { FastifyPluginAsync } from "fastify";
import { db } from "../storage/db.js";
import { oauthCodes, oauthTokens, oauthClients, tenants } from "../storage/schema.js";
import { eq, and } from "drizzle-orm";
import { randomBytes, createHash } from "crypto";
import { z } from "zod";
import { config } from "../config.js";

function getBaseUrl(): string {
    return config.WEBHOOK_BASE_URL || `http://localhost:${config.PORT}`;
}

function getDashboardUrl(): string {
    return config.DASHBOARD_URL || "http://localhost:3001";
}

/**
 * Mint a Pulse access token for a tenant using the exact same scheme as the
 * `/oauth/token` exchange below (`pls_` prefix, SHA-256 hash stored — never
 * the raw token), so tokens minted here validate against the same
 * `resolveToken()` check in `gateway/routes/mcp.ts` / `gateway/ws/ws-auth.ts`.
 *
 * Callers own the trust decision (e.g. checking `enable_third_party_cli`)
 * BEFORE calling this — it does not re-check anything, it only issues.
 */
export async function mintAppAccessToken(
    tenantId: string,
    clientId: string,
    ttlMs: number = 30 * 24 * 60 * 60 * 1000,
): Promise<{ token: string; expiresAt: Date }> {
    const accessToken = "pls_" + randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(accessToken).digest("hex");
    const expiresAt = new Date(Date.now() + ttlMs);

    await db.insert(oauthTokens).values({
        accessToken: tokenHash,
        clientId,
        tenantId,
        expiresAt,
    });

    return { token: accessToken, expiresAt };
}

export const oauthRoutes: FastifyPluginAsync = async (server) => {

    // ── Well-Known Discovery Endpoints ────────────────────────────

    server.get("/.well-known/oauth-protected-resource", async (_request, reply) => {
        const baseUrl = getBaseUrl();
        return reply.send({
            resource: baseUrl,
            authorization_servers: [baseUrl],
        });
    });

    server.get("/.well-known/oauth-authorization-server", async (_request, reply) => {
        const baseUrl = getBaseUrl();
        const dashboardUrl = getDashboardUrl();
        return reply.send({
            issuer: baseUrl,
            authorization_endpoint: `${dashboardUrl}/oauth/authorize`,
            token_endpoint: `${baseUrl}/oauth/token`,
            registration_endpoint: `${baseUrl}/oauth/register`,
            response_types_supported: ["code"],
            grant_types_supported: ["authorization_code"],
            code_challenge_methods_supported: ["S256"],
            token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
        });
    });

    // ── Dynamic Client Registration ────────────────────────────

    const registerSchema = z.object({
        client_name: z.string().min(1),
        redirect_uris: z.array(z.string()).min(1),
        grant_types: z.array(z.string()).optional().default(["authorization_code"]),
        token_endpoint_auth_method: z.string().optional().default("none"),
        tenant_id: z.string().uuid().optional(),
    });

    server.post("/oauth/register", async (request, reply) => {
        try {
            const parsed = registerSchema.parse(request.body);

            const clientId = `pls_${randomBytes(16).toString("hex")}`;

            // Public client (PKCE) — no secret needed
            // tenant_id is optional for dynamically registered clients (e.g. Claude Code)
            // — tenant is resolved during the authorize step from the logged-in user's session
            await db.insert(oauthClients).values({
                tenantId: parsed.tenant_id ?? null,
                clientId,
                clientSecretHash: "public", // Marker for public clients
                name: parsed.client_name,
                redirectUris: parsed.redirect_uris,
            });

            return reply.code(201).send({
                client_id: clientId,
                client_name: parsed.client_name,
                redirect_uris: parsed.redirect_uris,
                grant_types: parsed.grant_types,
                token_endpoint_auth_method: parsed.token_endpoint_auth_method,
            });
        } catch (error) {
            if (error instanceof z.ZodError) {
                return reply.code(400).send({ error: "invalid_client_metadata", details: error.issues });
            }
            server.log.error(error);
            return reply.code(500).send({ error: "server_error" });
        }
    });

    // ── Authorize — Redirect to Dashboard Consent Page ─────────

    // GET /oauth/authorize — CLI tools open this in the browser.
    // We redirect to the dashboard consent page where the user approves.
    server.get("/oauth/authorize", async (request, reply) => {
        const query = request.query as Record<string, string>;
        const params = new URLSearchParams();

        // Forward all standard OAuth params to the dashboard consent page
        for (const key of ["client_id", "redirect_uri", "response_type", "state", "code_challenge", "code_challenge_method", "scope"]) {
            if (query[key]) params.set(key, query[key]);
        }

        const dashboardUrl = getDashboardUrl();
        return reply.redirect(`${dashboardUrl}/oauth/authorize?${params.toString()}`);
    });

    // NOTE: there is deliberately NO `POST /oauth/authorize` handler. Authorization
    // codes are only ever issued by the dashboard consent action
    // (`dashboard/src/app/oauth/authorize/actions.ts`), which derives `tenantId`
    // from the authenticated session. A body-driven variant used to exist here for
    // "direct API usage" but it trusted `tenant_id` from the request body with no
    // auth or consent, letting anyone mint a token for any tenant — removed. The
    // GET handler above is the entry point: it redirects to that consent page.

    // ── Token Exchange (OAuth 2.0 Standard endpoint) ────────────────────────────

    server.post("/oauth/token", async (request, reply) => {
        try {
            const body = request.body as Record<string, any>;

            const grant_type = body.grant_type;
            const code = body.code;
            const client_id = body.client_id;
            const client_secret = body.client_secret;
            const code_verifier = body.code_verifier;

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

            // Validate redirect URI matches what was used during authorization
            const redirect_uri = body.redirect_uri;
            if (authCode.redirectUri && redirect_uri !== authCode.redirectUri) {
                return reply.code(400).send({
                    error: "invalid_grant",
                    error_description: "redirect_uri does not match the URI used during authorization",
                });
            }

            // PKCE verification
            if (authCode.codeChallenge) {
                if (!code_verifier) {
                    return reply.code(400).send({
                        error: "invalid_grant",
                        error_description: "code_verifier is required for PKCE",
                    });
                }
                const computedChallenge = createHash("sha256")
                    .update(code_verifier)
                    .digest("base64url");

                if (computedChallenge !== authCode.codeChallenge) {
                    return reply.code(400).send({
                        error: "invalid_grant",
                        error_description: "code_verifier does not match code_challenge",
                    });
                }
            } else {
                // No PKCE — require client_secret for confidential clients
                const client = await db.query.oauthClients.findFirst({
                    where: eq(oauthClients.clientId, client_id),
                });

                if (client && client.clientSecretHash !== "public") {
                    if (!client_secret) {
                        return reply.code(400).send({
                            error: "invalid_client",
                            error_description: "client_secret required for confidential clients",
                        });
                    }
                    const secretHash = createHash("sha256").update(client_secret).digest("hex");
                    if (secretHash !== client.clientSecretHash) {
                        return reply.code(400).send({ error: "invalid_client" });
                    }
                }
            }

            // Check if Third-Party CLI is enabled for this Tenant
            const tenant = await db.query.tenants.findFirst({
                where: eq(tenants.id, authCode.tenantId),
            });

            const tenantConfig = tenant?.config as Record<string, any>;
            if (!tenantConfig?.enable_third_party_cli) {
                return reply.code(403).send({
                    error: "access_denied",
                    error_description: "Third-party CLI access is disabled by your Admin."
                });
            }

            // Successfully authenticated, generate access token
            const ttlMs = 30 * 24 * 60 * 60 * 1000; // 30 Days
            const { token: accessToken } = await mintAppAccessToken(authCode.tenantId, client_id, ttlMs);

            // Consume the auth code
            await db.delete(oauthCodes).where(eq(oauthCodes.id, authCode.id));

            return reply.send({
                access_token: accessToken,
                token_type: "Bearer",
                expires_in: ttlMs / 1000, // seconds
            });
        } catch (error) {
            server.log.error(error);
            return reply.code(500).send({ error: "server_error" });
        }
    });
};
