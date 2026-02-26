/**
 * API Token Authentication Middleware
 * Validates Bearer tokens against the api_tokens table.
 */

import { FastifyRequest, FastifyReply } from "fastify";
import { createHash } from "crypto";
import { db } from "../../storage/db.js";
import { apiTokens } from "../../storage/schema.js";
import { eq, sql } from "drizzle-orm";
import { logger } from "../../utils/logger.js";

export function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

export interface ApiTokenContext {
    tenantId: string;
    scopes: string[];
    tokenId: string;
}

export async function apiTokenAuth(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        reply.code(401).send({
            error: { message: "Missing or invalid Authorization header.", type: "invalid_request_error", code: "invalid_api_key" },
        });
        return;
    }

    const token = authHeader.slice(7);
    const tokenHash = hashToken(token);

    try {
        const record = await db.query.apiTokens.findFirst({
            where: eq(apiTokens.tokenHash, tokenHash),
        });

        if (!record) {
            reply.code(401).send({
                error: { message: "Invalid API token.", type: "invalid_request_error", code: "invalid_api_key" },
            });
            return;
        }

        if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
            reply.code(401).send({
                error: { message: "API token has expired.", type: "invalid_request_error", code: "invalid_api_key" },
            });
            return;
        }

        // Update last_used_at (fire and forget)
        db.execute(
            sql`UPDATE api_tokens SET last_used_at = now() WHERE id = ${record.id}::uuid`
        ).catch(() => {});

        (request as any).apiTokenContext = {
            tenantId: record.tenantId,
            scopes: record.scopes || ["chat", "responses"],
            tokenId: record.id,
        } satisfies ApiTokenContext;
    } catch (err) {
        logger.error({ err }, "API token auth failed");
        reply.code(500).send({ error: { message: "Internal authentication error.", type: "api_error" } });
    }
}

export function getApiTokenContext(request: FastifyRequest): ApiTokenContext | null {
    return (request as any).apiTokenContext || null;
}
