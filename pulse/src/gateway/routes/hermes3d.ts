/**
 * Hermes3D runtime seam.
 *
 * Hermes3D (https://github.com/iamlukethedev/Hermes3D, MIT) is a 3D office that
 * visualises an agent workforce. It talks to a backend through a small HTTP
 * contract — `/health`, `/state`, `/registry`, `/v1/chat/completions` — and
 * Pulse already serves the first and last of those. These are the other two.
 *
 * TENANCY: Hermes3D has no tenant concept; it assumes one workforce per runtime.
 * Pulse is multi-tenant, so the tenant comes from the API token exactly like
 * every other route here. One Hermes3D instance therefore shows exactly one
 * workspace — which matches how Pulse is deployed anyway (a box per customer).
 */

import { FastifyPluginAsync } from "fastify";
import { and, eq } from "drizzle-orm";
import { apiTokenAuth, getApiTokenContext } from "../middleware/api-token-auth.js";
import { db } from "../../storage/db.js";
import { agentProfiles } from "../../storage/schema.js";
import { logger } from "../../utils/logger.js";

/** `Natalie Harrington` -> `natalie-harrington`. Hermes3D titlecases it back. */
function slug(name: string): string {
    return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "agent";
}

export const hermes3dRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.addHook("preHandler", apiTokenAuth);

    /**
     * GET /state — the workforce, as Hermes3D expects it.
     *
     * Agents come from `active`: each KEY becomes an agent (id = key, name =
     * titleCased key) and each VALUE is the model it answers on. The model is
     * `pulse:<agentId>`, which is what /v1/chat/completions already resolves,
     * so chatting to an agent in the 3D office routes to the right profile with
     * no extra plumbing.
     */
    fastify.get("/state", async (request, reply) => {
        const ctx = getApiTokenContext(request);
        if (!ctx) return reply.code(401).send({ error: "Unauthorized" });

        try {
            const profiles = await db
                .select({ id: agentProfiles.id, name: agentProfiles.name, title: agentProfiles.title, modelId: agentProfiles.modelId })
                .from(agentProfiles)
                .where(and(eq(agentProfiles.tenantId, ctx.tenantId), eq(agentProfiles.enabled, true)));

            const active: Record<string, string> = {};
            for (const p of profiles) active[slug(p.name)] = `pulse:${p.id}`;

            const first = profiles[0];
            return reply.send({
                profileName: "pulse",
                registry_profile: "pulse",
                active,
                identity: first
                    ? { name: first.name, role: first.title ?? null, lane: null, model_id: `pulse:${first.id}` }
                    : null,
                runtime: {
                    name: "Pulse AI",
                    version: process.env.APP_VERSION || "dev",
                    vendor: "Runstate",
                    status: "ok",
                    active_model: first ? `pulse:${first.id}` : null,
                },
            });
        } catch (err) {
            logger.error({ err, tenantId: ctx.tenantId }, "hermes3d: /state failed");
            return reply.code(500).send({ error: "Failed to read workforce state." });
        }
    });

    /** GET /registry — the models Hermes3D may pick from, one per agent. */
    fastify.get("/registry", async (request, reply) => {
        const ctx = getApiTokenContext(request);
        if (!ctx) return reply.code(401).send({ error: "Unauthorized" });

        try {
            const profiles = await db
                .select({ id: agentProfiles.id, name: agentProfiles.name, title: agentProfiles.title, modelId: agentProfiles.modelId })
                .from(agentProfiles)
                .where(and(eq(agentProfiles.tenantId, ctx.tenantId), eq(agentProfiles.enabled, true)));

            const models: Record<string, unknown> = {};
            for (const p of profiles) {
                models[`pulse:${p.id}`] = {
                    name: p.name,
                    role: p.title ?? null,
                    // The real underlying LLM, for display only — routing is by agent.
                    backing_model: p.modelId ?? null,
                };
            }
            return reply.send({ profile: "pulse", models });
        } catch (err) {
            logger.error({ err, tenantId: ctx.tenantId }, "hermes3d: /registry failed");
            return reply.code(500).send({ error: "Failed to read registry." });
        }
    });
};
