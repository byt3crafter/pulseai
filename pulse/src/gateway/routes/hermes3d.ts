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
import { onFloorEvent, type FloorEvent } from "../../utils/floor-bus.js";
import { apiTokenAuth, getApiTokenContext } from "../middleware/api-token-auth.js";
import { db } from "../../storage/db.js";
import { agentProfiles, agentRuns } from "../../storage/schema.js";
import { logger } from "../../utils/logger.js";

/** `Natalie Harrington` -> `natalie-harrington`. Hermes3D titlecases it back. */
export function slug(name: string): string {
    return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "agent";
}


/**
 * Tool name -> what to say the agent is doing. Shown as a speech bubble over
 * the agent's desk, so it reads as a person working, not as a log line.
 * An unmapped tool falls back to the raw name rather than going silent —
 * a new tool should look odd, not invisible.
 */
const TOOL_CAPTIONS: Record<string, string> = {
    // Names here are the real registered tool names — checked against what a
    // workspace actually has enabled, not guessed from the tool's purpose. A
    // wrong key does not break anything, it just quietly falls back.
    web_search: "searching the web",
    web_fetch: "reading a page",
    email_send: "sending an email",
    email_reply: "writing a reply",
    email_read: "reading an email",
    email_list: "going through email",
    email_search: "searching email",
    email_fetch_unread: "checking email",
    email_draft: "drafting an email",
    email_flag: "flagging an email",
    email_move: "filing an email",
    email_read_attachment: "opening an attachment",
    calendar_add: "adding to the calendar",
    calendar_list: "checking the calendar",
    calendar_search: "looking through the calendar",
    contact_lookup: "looking up a contact",
    contact_save: "saving a contact",
    memory_search: "checking my notes",
    memory_store: "making a note",
    memory_forget: "forgetting something",
    note_save: "writing a note",
    note_search: "looking through my notes",
    todo_add: "adding a to-do",
    todo_list: "checking my to-dos",
    task_create: "opening a task",
    task_update: "updating a task",
    task_complete: "closing a task",
    commitment_create: "making a commitment",
    commitment_complete: "following through",
    commitment_list: "checking what I owe",
    schedule_job: "scheduling something",
    schedule_once: "setting a reminder",
    list_jobs: "checking the schedule",
    cancel_job: "cancelling a job",
    delegate_to_agent: "handing this over",
    route_to_channel: "passing this along",
    list_agents: "finding the right person",
    server_exec: "on the server",
    server_list: "checking the servers",
    bash_sandbox: "running some code",
    python_execute: "running some code",
    pdf_read: "reading a PDF",
    pdf_fill_form: "filling in a form",
    document_read: "reading a document",
    document_search: "searching the documents",
    expense_add: "logging an expense",
    calculator: "working it out",
    get_current_time: "checking the time",
    bookmark_save: "saving a link",
    workspace_update: "updating my setup",
};


export function captionFor(tool: string): string {
    return TOOL_CAPTIONS[tool] ?? tool.replace(/_/g, " ");
}

/** The office keys sessions as `agent:<id>:main`, where id is the /state slug. */
export function sessionKeyFor(agentSlug: string): string {
    return `agent:${agentSlug}:main`;
}


/**
 * A Pulse floor event as the office's own event frames.
 *
 * Pure and exported so the mapping can be tested without a socket, a database
 * or a running gateway — this is the part that has to stay exactly in step with
 * what the office expects (`normalizeGatewayEvent` on its side), and it is the
 * part that will silently stop animating anything if it drifts.
 *
 * Returns an array because one Pulse event is not always one office frame, and
 * an empty array for events with nothing to show.
 */
export function floorEventToFrames(
    event: FloorEvent,
    who: { slug: string; name: string }
): unknown[] {
    const timestamp = Date.now();
    const lifecycle = (phase: "start" | "end" | "error") => ({
        type: "event",
        event: "agent",
        payload: {
            stream: "lifecycle",
            runId: event.runId,
            sessionKey: sessionKeyFor(who.slug),
            data: { phase },
            timestamp,
        },
    });

    if (event.type === "run:start") return [lifecycle("start")];
    if (event.type === "run:end") {
        return [lifecycle(event.status === "completed" ? "end" : "error")];
    }
    if (event.type === "run:tool") {
        return [
            {
                type: "event",
                event: "office.speech",
                payload: {
                    agentId: who.slug,
                    name: who.name,
                    text: captionFor(event.tool),
                    timestamp,
                },
            },
        ];
    }
    return [];
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
    /**
     * GET /events — live work, as Server-Sent Events.
     *
     * WHY THIS EXISTS: the office knew only about work it started itself. Its
     * custom-runtime adapter is pure HTTP request/response — `connect()` is a
     * /health probe and no socket is ever opened — so its only writer of
     * "running" was its own outgoing chat. Give an agent a job from the
     * dashboard, Telegram, a schedule or a commitment and the office sat at
     * "0 working" for the whole run.
     *
     * Pulse was already emitting exactly the right thing: run-recorder fires
     * every run into floor-bus regardless of what triggered it. Nothing was
     * listening. This translates that stream into the frames the office already
     * understands, so its existing "derive animation from runtime signals"
     * logic lights up without the office learning anything about Pulse.
     *
     * SSE, not WebSocket: this is one-way, it survives proxies that mangle
     * upgrades, and browsers reconnect it on their own.
     */
    fastify.get("/events", async (request, reply) => {
        const ctx = getApiTokenContext(request);
        if (!ctx) return reply.code(401).send({ error: "Unauthorized" });

        const tenantId = ctx.tenantId;

        // agentProfileId -> what the office calls that agent. Built once and
        // refreshed only on a miss, so the common path touches no database.
        let names = new Map<string, { slug: string; name: string }>();
        const loadNames = async () => {
            const profiles = await db
                .select({ id: agentProfiles.id, name: agentProfiles.name })
                .from(agentProfiles)
                .where(eq(agentProfiles.tenantId, tenantId));
            names = new Map(profiles.map((p) => [p.id, { slug: slug(p.name), name: p.name }]));
        };
        await loadNames();

        reply.raw.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            // nginx buffers SSE by default, which holds every frame until the
            // response ends — i.e. forever. This is what makes it stream.
            "X-Accel-Buffering": "no",
        });

        let open = true;
        const send = (frame: unknown) => {
            if (!open) return;
            try {
                reply.raw.write(`data: ${JSON.stringify(frame)}\n\n`);
            } catch {
                // A dead socket must never take a run down with it.
                open = false;
            }
        };

        const lifecycle = (agentSlug: string, runId: string, phase: "start" | "end" | "error") =>
            send({
                type: "event",
                event: "agent",
                payload: {
                    stream: "lifecycle",
                    runId,
                    sessionKey: sessionKeyFor(agentSlug),
                    data: { phase },
                    timestamp: Date.now(),
                },
            });

        // A browser that opens mid-run has to be told what is ALREADY running —
        // a pure event stream can only ever describe the future, so without this
        // an agent that started work before you opened the floor looks idle
        // until it finishes.
        try {
            const running = await db
                .select({ id: agentRuns.id, agentProfileId: agentRuns.agentProfileId })
                .from(agentRuns)
                .where(and(eq(agentRuns.tenantId, tenantId), eq(agentRuns.status, "running")));
            for (const run of running) {
                const who = run.agentProfileId ? names.get(run.agentProfileId) : null;
                if (who) lifecycle(who.slug, run.id, "start");
            }
        } catch (err) {
            logger.error({ err, tenantId }, "hermes3d: /events snapshot failed");
        }

        const unsubscribe = onFloorEvent((event: FloorEvent) => {
            if (event.tenantId !== tenantId) return;
            const who = event.agentProfileId ? names.get(event.agentProfileId) : null;
            if (!who) {
                // A profile added since this stream opened. Refresh once; the
                // event is lost but the next one lands.
                if (event.agentProfileId) void loadNames();
                return;
            }
            for (const frame of floorEventToFrames(event, who)) send(frame);
        });

        // Idle connections get reaped by proxies; a comment line is not an event
        // and costs the client nothing.
        const heartbeat = setInterval(() => {
            if (!open) return;
            try {
                reply.raw.write(": ping\n\n");
            } catch {
                open = false;
            }
        }, 25_000);

        const close = () => {
            if (!open) return;
            open = false;
            clearInterval(heartbeat);
            unsubscribe();
            try {
                reply.raw.end();
            } catch {
                /* already gone */
            }
        };
        request.raw.on("close", close);
        request.raw.on("error", close);
    });
};
