/**
 * Process Tool — manage background sessions (list/poll/log/write/kill/clear).
 */

import { Tool } from "../tool.interface.js";
import { backgroundSessionManager } from "../background-session-manager.js";

export const processTool: Tool = {
    name: "process",
    description: "Manage background shell sessions. Actions: list, poll, log, write, kill, clear.",
    parameters: {
        type: "object",
        properties: {
            action: {
                type: "string",
                description: "Action to perform: list, poll, log, write, kill, clear",
                enum: ["list", "poll", "log", "write", "kill", "clear"],
            },
            sessionId: { type: "string", description: "Session ID (required for poll/log/write/kill/clear)." },
            data: { type: "string", description: "Stdin data (for write action)." },
            offset: { type: "number", description: "Output offset for log action." },
            limit: { type: "number", description: "Max lines for log action." },
        },
        required: ["action"],
    },
    execute: async ({ args, tenantId, conversationId }) => {
        const { action, sessionId, data, offset = 0, limit = 200 } = args;
        const agentId = conversationId;

        switch (action) {
            case "list": {
                const sessions = backgroundSessionManager.listForAgent(tenantId, agentId);
                const summary = sessions.map(s => ({
                    id: s.id,
                    command: s.command.slice(0, 100),
                    status: s.status,
                    pid: s.pid,
                    exitCode: s.exitCode,
                    startedAt: new Date(s.startedAt).toISOString(),
                    exitedAt: s.exitedAt ? new Date(s.exitedAt).toISOString() : null,
                }));
                return { result: JSON.stringify(summary, null, 2) };
            }

            case "poll": {
                if (!sessionId) return { result: "Error: sessionId required for poll." };
                const session = backgroundSessionManager.get(sessionId);
                if (!session || session.tenantId !== tenantId) {
                    return { result: "Error: Session not found." };
                }
                const newOutput = session.stdout.slice(session.lastPolledOffset);
                session.lastPolledOffset = session.stdout.length;
                return {
                    result: JSON.stringify({
                        status: session.status,
                        newOutput: newOutput || "(no new output)",
                        exitCode: session.exitCode,
                    }),
                };
            }

            case "log": {
                if (!sessionId) return { result: "Error: sessionId required for log." };
                const session = backgroundSessionManager.get(sessionId);
                if (!session || session.tenantId !== tenantId) {
                    return { result: "Error: Session not found." };
                }
                const lines = session.stdout.split("\n");
                const slice = lines.slice(offset, offset + limit);
                return {
                    result: JSON.stringify({
                        status: session.status,
                        totalLines: lines.length,
                        offset,
                        output: slice.join("\n"),
                        stderr: session.stderr || undefined,
                    }),
                };
            }

            case "write": {
                if (!sessionId) return { result: "Error: sessionId required for write." };
                if (!data) return { result: "Error: data required for write." };
                const session = backgroundSessionManager.get(sessionId);
                if (!session || session.tenantId !== tenantId) {
                    return { result: "Error: Session not found." };
                }
                if (session.status !== "running" || !session.pid) {
                    return { result: "Error: Session is not running." };
                }
                // Note: stdin writing requires the process handle, which we don't retain.
                // This is a limitation of the current design.
                return { result: "Error: stdin writing not supported for backgrounded processes." };
            }

            case "kill": {
                if (!sessionId) return { result: "Error: sessionId required for kill." };
                const session = backgroundSessionManager.get(sessionId);
                if (!session || session.tenantId !== tenantId) {
                    return { result: "Error: Session not found." };
                }
                if (session.status === "running" && session.pid) {
                    try {
                        process.kill(session.pid, "SIGTERM");
                        setTimeout(() => {
                            try { process.kill(session.pid!, "SIGKILL"); } catch {}
                        }, 5000);
                        backgroundSessionManager.complete(sessionId, null, "killed");
                        return { result: `Session ${sessionId} killed.` };
                    } catch {
                        return { result: "Error: Failed to kill process." };
                    }
                }
                return { result: "Session is not running." };
            }

            case "clear": {
                if (!sessionId) return { result: "Error: sessionId required for clear." };
                const session = backgroundSessionManager.get(sessionId);
                if (!session || session.tenantId !== tenantId) {
                    return { result: "Error: Session not found." };
                }
                if (session.status === "running") {
                    return { result: "Error: Cannot clear a running session. Kill it first." };
                }
                backgroundSessionManager.remove(sessionId);
                return { result: `Session ${sessionId} cleared.` };
            }

            default:
                return { result: `Error: Unknown action '${action}'.` };
        }
    },
};
