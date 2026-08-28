/**
 * Admin API for skill packs.
 *
 * Import lives in the gateway rather than the dashboard because the parser,
 * the tar reader and the SSRF guard all live here — a second copy in the
 * dashboard would be a second place for the identity and dedup rules to drift,
 * and those rules are what stop real skills being silently lost.
 *
 * Auth is the shared ADMIN_API_KEY, compared in constant time, matching
 * config-api.ts. The dashboard calls these after its own requireAdmin() check.
 *
 * See docs/SKILLS_PLAN.md.
 */

import { FastifyPluginAsync } from "fastify";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../../storage/db.js";
import { skillPacks } from "../../storage/schema.js";
import { fetchPack } from "../../skills/skill-fetcher.js";
import { persistImport } from "../../skills/skill-service.js";
import { logger } from "../../utils/logger.js";

export const skillsApiRoutes: FastifyPluginAsync = async (fastify) => {
    const adminAuth = async (request: any, reply: any) => {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
            return reply.code(401).send({ error: "Authentication required" });
        }
        const adminKey = process.env.ADMIN_API_KEY;
        if (!adminKey) return reply.code(503).send({ error: "Admin API not configured" });
        try {
            const a = Buffer.from(authHeader.slice(7));
            const b = Buffer.from(adminKey);
            if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
                return reply.code(401).send({ error: "Invalid credentials" });
            }
        } catch {
            return reply.code(401).send({ error: "Invalid credentials" });
        }
    };

    /**
     * Import (or re-import) a pack from its source.
     *
     * Long-running by nature — a large repo is a few seconds — so the caller
     * should expect to wait rather than poll.
     */
    fastify.post<{ Params: { id: string } }>(
        "/api/admin/skills/packs/:id/import",
        { preHandler: adminAuth },
        async (request, reply) => {
            const packId = request.params.id;
            const pack = await db.query.skillPacks.findFirst({ where: eq(skillPacks.id, packId) });
            if (!pack) return reply.code(404).send({ error: "Pack not found" });
            if (!pack.sourceUrl) return reply.code(400).send({ error: "Pack has no source URL" });

            try {
                const report = await fetchPack(pack.sourceUrl, pack.sourceRef || "main");
                const { inserted, approvalCleared } = await persistImport(packId, report);

                logger.info(
                    { packId, inserted, skipped: report.skipped.length, approvalCleared },
                    "Skill pack imported",
                );
                return {
                    ok: true,
                    imported: inserted,
                    skipped: report.skipped.length,
                    // Surfaced so the admin is told the pack went inert rather
                    // than discovering it when agents quietly lose their skills.
                    approvalCleared,
                };
            } catch (err) {
                const message = err instanceof Error ? err.message : "Import failed.";
                await db
                    .update(skillPacks)
                    .set({ lastImportError: message, lastImportAt: new Date() })
                    .where(eq(skillPacks.id, packId));
                logger.warn({ err, packId }, "Skill pack import failed");
                // The message describes the operator's own input (bad URL, bad
                // branch), so it is safe and useful to return.
                return reply.code(400).send({ error: message });
            }
        },
    );
};
