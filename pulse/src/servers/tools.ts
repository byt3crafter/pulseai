/**
 * Server Inventory tools — give an agent controlled SSH access to the
 * tenant's registered servers. Mirrors the shape of ../agent/tools/custom-tools.ts
 * (per-tenant, per-agent scoped, injected in registry.ts), but access here is
 * default-deny: a server with an empty `allowedAgentIds` is NOT available to
 * any agent — explicit assignment is required because this is infrastructure
 * access, not a generic API call.
 *
 * Safety is enforced IN CODE via ../servers/command-policy.ts, keyed off each
 * server's `safetyMode`. Every server_exec attempt — blocked or not — is
 * written to server_exec_logs for audit.
 */
import { Tool } from "../agent/tools/tool.interface.js";
import { db } from "../storage/db.js";
import { servers, serverExecLogs, agentProfiles } from "../storage/schema.js";
import { eq, and } from "drizzle-orm";
import { decrypt } from "../utils/crypto.js";
import { logger } from "../utils/logger.js";
import { checkCommandPolicy, isReadOnlyCommand, SafetyMode } from "./command-policy.js";
import { sshExec } from "./ssh-exec.js";
import { createApproval, awaitDecision, hasStandingAllowance } from "../channels/approval-service.js";

const DEFAULT_TIMEOUT_SECONDS = 30;
const MAX_TIMEOUT_SECONDS = 120;
const RESULT_TRUNCATE_CHARS = 8_000; // returned to the LLM; the SSH engine itself caps raw output at 100KB
const LOG_OUTPUT_HEAD_CHARS = 500;

interface ServerRow {
    id: string;
    name: string;
    host: string;
    port: number;
    username: string;
    authType: string;
    encryptedSecret: string;
    environment: string;
    safetyMode: string;
    instructions: string | null;
    allowedAgentIds: unknown;
    approvalMode: string;
    enabled: boolean;
}

function truncate(text: string, max = RESULT_TRUNCATE_CHARS): string {
    if (text.length <= max) return text;
    return text.slice(0, max) + `\n…[truncated ${text.length - max} chars]`;
}

/** This tenant's enabled servers that explicitly grant access to `agentProfileId`. */
async function getAccessibleServers(tenantId: string, agentProfileId: string): Promise<ServerRow[]> {
    const rows = await db
        .select()
        .from(servers)
        .where(and(eq(servers.tenantId, tenantId), eq(servers.enabled, true)));
    return (rows as unknown as ServerRow[]).filter((r) => {
        const allowed = Array.isArray(r.allowedAgentIds) ? (r.allowedAgentIds as string[]) : [];
        // Default-deny: an empty list means NO agent may access this server.
        return allowed.includes(agentProfileId);
    });
}

async function logAttempt(entry: {
    tenantId: string;
    serverId: string;
    agentId: string;
    command: string;
    blocked: boolean;
    blockReason?: string | null;
    exitCode?: number | null;
    durationMs?: number | null;
    outputHead?: string | null;
}): Promise<void> {
    try {
        await db.insert(serverExecLogs).values({
            tenantId: entry.tenantId,
            serverId: entry.serverId,
            agentId: entry.agentId,
            command: entry.command,
            blocked: entry.blocked,
            blockReason: entry.blockReason ?? null,
            exitCode: entry.exitCode ?? null,
            durationMs: entry.durationMs ?? null,
            outputHead: entry.outputHead ?? null,
        });
    } catch (err) {
        // Never let audit-logging failures break the tool call.
        logger.error({ err, serverId: entry.serverId }, "Failed to write server_exec_logs entry");
    }
}

function buildServerListTool(tenantId: string, agentProfileId: string): Tool {
    return {
        name: "server_list",
        description:
            "List the servers this agent has been granted SSH access to. ALWAYS call this first, before server_exec — " +
            "each entry includes the operator's instructions verbatim. READ them and FOLLOW them before running any command " +
            "(e.g. 'never restart the database', 'deploy only via ./deploy.sh').",
        parameters: { type: "object", properties: {}, required: [] },
        async execute({ tenantId: t }) {
            const rows = await getAccessibleServers(t || tenantId, agentProfileId);
            if (rows.length === 0) {
                return { result: "No servers are available to this agent." };
            }
            const list = rows.map((r) => ({
                name: r.name,
                host: r.host,
                environment: r.environment,
                safety_mode: r.safetyMode,
                instructions: r.instructions || "(no operating instructions provided — proceed carefully)",
            }));
            return { result: JSON.stringify(list, null, 2) };
        },
    };
}

function buildServerExecTool(tenantId: string, agentProfileId: string): Tool {
    return {
        name: "server_exec",
        description:
            "Run a shell command on one of this agent's servers over SSH — resolve the server by the exact `name` from " +
            "server_list. Destructive commands are automatically blocked by policy on servers whose safety mode is not " +
            "'full' (observe = read-only diagnostics only; safe = anything except destructive operations). " +
            "Always follow the server's operating instructions from server_list.",
        parameters: {
            type: "object",
            properties: {
                server: { type: "string", description: "The server's name, exactly as returned by server_list." },
                command: { type: "string", description: "The shell command to run on the server." },
                timeout_seconds: {
                    type: "number",
                    description: `Optional command timeout in seconds (default ${DEFAULT_TIMEOUT_SECONDS}, max ${MAX_TIMEOUT_SECONDS}).`,
                },
            },
            required: ["server", "command"],
        },
        async execute({ tenantId: t, args }) {
            const effectiveTenantId = t || tenantId;
            const serverName = String(args.server || "").trim();
            const command = String(args.command ?? "");
            const timeoutSeconds = Math.min(
                MAX_TIMEOUT_SECONDS,
                Math.max(1, Number(args.timeout_seconds) || DEFAULT_TIMEOUT_SECONDS)
            );

            if (!serverName || !command.trim()) {
                return { result: "Both 'server' and 'command' are required." };
            }

            const accessible = await getAccessibleServers(effectiveTenantId, agentProfileId);
            const server = accessible.find((r) => r.name === serverName);
            if (!server) {
                return {
                    result: `Server "${serverName}" was not found, is disabled, or is not accessible to this agent. Call server_list to see available servers.`,
                };
            }

            const policy = checkCommandPolicy(command, server.safetyMode as SafetyMode);
            if (!policy.allowed) {
                await logAttempt({
                    tenantId: effectiveTenantId,
                    serverId: server.id,
                    agentId: agentProfileId,
                    command,
                    blocked: true,
                    blockReason: policy.reason,
                });
                return {
                    result: JSON.stringify({
                        blocked: true,
                        reason: policy.reason,
                        server_instructions: server.instructions || null,
                    }),
                };
            }

            // Approval gate (stage 2 of People access control): 'off' never asks,
            // 'writes' asks for anything not classified read-only, 'all' asks
            // for every command. A standing allowance ("Allow always", granted
            // from a previous approval card) bypasses this permanently, scoped
            // per-server, until an admin revokes it from the dashboard.
            let approvalNote = "";
            const approvalMode = server.approvalMode || "off";
            if (approvalMode !== "off") {
                const needsApproval = approvalMode === "all" || !isReadOnlyCommand(command);
                let hasAllowance = false;
                try {
                    hasAllowance = await hasStandingAllowance(effectiveTenantId, "server", server.id);
                } catch (err) {
                    logger.error({ err, serverId: server.id }, "Standing allowance lookup failed for server_exec — failing closed (will require approval)");
                }
                if (needsApproval && !hasAllowance) {
                    let agentName = "An agent";
                    try {
                        const profile = await db.query.agentProfiles.findFirst({
                            where: eq(agentProfiles.id, agentProfileId),
                            columns: { name: true },
                        });
                        if (profile?.name) agentName = profile.name;
                    } catch {
                        // Best-effort label only — never blocks the approval flow.
                    }

                    let outcome: { status: string; approverLabel?: string };
                    try {
                        const { id: approvalId } = await createApproval({
                            tenantId: effectiveTenantId,
                            kind: "command",
                            summary: `🔐 ${agentName} wants to run on ${server.name}:\n\`${command}\``,
                            agentProfileId,
                            serverId: server.id,
                            payload: { command, serverName: server.name },
                        });
                        outcome = await awaitDecision(approvalId);
                    } catch (err) {
                        logger.error({ err, serverId: server.id }, "Approval workflow failed for server_exec — failing closed");
                        outcome = { status: "expired" };
                    }

                    if (outcome.status !== "approved") {
                        const blockReason =
                            outcome.status === "denied"
                                ? `Denied by approver${outcome.approverLabel ? ` (${outcome.approverLabel})` : ""} — approval required.`
                                : "Approval timed out — command not run.";
                        await logAttempt({
                            tenantId: effectiveTenantId,
                            serverId: server.id,
                            agentId: agentProfileId,
                            command,
                            blocked: true,
                            blockReason,
                        });
                        return {
                            result:
                                outcome.status === "denied"
                                    ? `Denied by approver${outcome.approverLabel ? ` (${outcome.approverLabel})` : ""}.`
                                    : "Approval timed out — not run.",
                        };
                    }

                    approvalNote = `[Approved${outcome.approverLabel ? ` by ${outcome.approverLabel}` : ""} via approval workflow]\n`;
                }
            }

            let secret: string;
            try {
                secret = decrypt(server.encryptedSecret);
            } catch (err) {
                logger.error({ err, serverId: server.id }, "Failed to decrypt server credentials");
                return { result: "Could not decrypt this server's credentials — contact your administrator." };
            }

            const start = Date.now();
            try {
                const execResult = await sshExec(
                    {
                        host: server.host,
                        port: server.port,
                        username: server.username,
                        authType: server.authType === "password" ? "password" : "key",
                        secret,
                    },
                    command,
                    { timeoutSeconds }
                );
                const durationMs = Date.now() - start;
                const combinedHead = `${approvalNote}${execResult.stdout}${execResult.stderr}`.slice(0, LOG_OUTPUT_HEAD_CHARS);
                await logAttempt({
                    tenantId: effectiveTenantId,
                    serverId: server.id,
                    agentId: agentProfileId,
                    command,
                    blocked: false,
                    exitCode: execResult.exitCode,
                    durationMs,
                    outputHead: combinedHead,
                });
                return {
                    result: JSON.stringify({
                        exit_code: execResult.exitCode,
                        timed_out: execResult.timedOut,
                        stdout: truncate(execResult.stdout),
                        stderr: truncate(execResult.stderr),
                    }),
                };
            } catch (err: any) {
                const durationMs = Date.now() - start;
                const message = err?.message || "Failed to execute the command over SSH.";
                await logAttempt({
                    tenantId: effectiveTenantId,
                    serverId: server.id,
                    agentId: agentProfileId,
                    command,
                    blocked: false,
                    durationMs,
                    outputHead: message.slice(0, LOG_OUTPUT_HEAD_CHARS),
                });
                return { result: `SSH error: ${message}` };
            }
        },
    };
}

/**
 * Load the server_list/server_exec tools for a tenant+agent, scoped to
 * servers that are enabled AND explicitly list this agent in allowedAgentIds.
 * Returns [] if the agent has no accessible servers (or no agentProfileId).
 */
export async function getTenantServerTools(tenantId: string, agentProfileId?: string): Promise<Tool[]> {
    try {
        if (!agentProfileId) return [];
        const rows = await getAccessibleServers(tenantId, agentProfileId);
        if (rows.length === 0) return [];
        return [buildServerListTool(tenantId, agentProfileId), buildServerExecTool(tenantId, agentProfileId)];
    } catch (err) {
        logger.error({ err, tenantId }, "Failed to load server tools");
        return [];
    }
}
