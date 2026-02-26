/**
 * Exec Tool — run shell commands with auto-background support.
 * Foreground: returns stdout/stderr directly.
 * Auto-background: after yieldMs, returns sessionId + tail, continues in background.
 */

import { Tool } from "../tool.interface.js";
import { spawn } from "child_process";
import { backgroundSessionManager, BackgroundSession } from "../background-session-manager.js";
import { logger } from "../../../utils/logger.js";
import { randomUUID } from "crypto";
import { evaluate } from "../safety/exec-policy.js";
import { credentialVault } from "../credential-vault.js";

export const execTool: Tool = {
    name: "exec",
    description: "Execute a shell command. If the command runs longer than yieldMs, it auto-backgrounds and returns a session ID you can poll with the 'process' tool.",
    parameters: {
        type: "object",
        properties: {
            command: { type: "string", description: "Shell command to execute." },
            yieldMs: { type: "number", description: "Auto-background threshold in ms (default: 10000)." },
            background: { type: "boolean", description: "Force immediate background execution." },
            timeout: { type: "number", description: "Max execution time in seconds (default: 1800)." },
            workdir: { type: "string", description: "Working directory for command." },
        },
        required: ["command"],
    },
    execute: async ({ args, tenantId, conversationId }) => {
        const { command, yieldMs = 10000, background = false, timeout = 1800, workdir } = args;
        const agentId = conversationId; // Use conversationId as scoping key
        const sessionId = randomUUID();

        // Exec safety check
        const decision = await evaluate(command, { tenantId, agentId, conversationId });
        if (!decision.allowed) {
            logger.warn({ tenantId, command: command.substring(0, 200), reason: decision.reason }, "Exec blocked by safety policy");
            return { result: `Command blocked by safety policy: ${decision.reason}` };
        }

        if (!backgroundSessionManager.canCreate(tenantId)) {
            return { result: "Error: Maximum concurrent background sessions reached for this tenant (10)." };
        }

        const session: BackgroundSession = {
            id: sessionId,
            tenantId,
            agentId,
            command,
            status: "running",
            stdout: "",
            stderr: "",
            exitCode: null,
            pid: null,
            startedAt: Date.now(),
            exitedAt: null,
            lastPolledOffset: 0,
        };

        backgroundSessionManager.register(session);

        // Inject vault credentials as env vars
        let envOverride: Record<string, string> | undefined;
        try {
            const vaultEnv = await credentialVault.getEnvVars(tenantId);
            if (Object.keys(vaultEnv).length > 0) {
                envOverride = { ...process.env as Record<string, string>, ...vaultEnv };
            }
        } catch (err) {
            logger.warn({ err, tenantId }, "Failed to inject vault credentials into exec");
        }

        const child = spawn("sh", ["-c", command], {
            cwd: workdir || undefined,
            timeout: timeout * 1000,
            stdio: ["pipe", "pipe", "pipe"],
            env: envOverride || undefined,
        });

        session.pid = child.pid || null;

        child.stdout?.on("data", (data: Buffer) => {
            backgroundSessionManager.appendStdout(sessionId, data.toString());
        });

        child.stderr?.on("data", (data: Buffer) => {
            backgroundSessionManager.appendStderr(sessionId, data.toString());
        });

        child.on("close", (code) => {
            backgroundSessionManager.complete(sessionId, code, code === 0 ? "completed" : "failed");
        });

        child.on("error", (err) => {
            backgroundSessionManager.appendStderr(sessionId, err.message);
            backgroundSessionManager.complete(sessionId, 1, "failed");
        });

        if (background) {
            return {
                result: JSON.stringify({ status: "running", sessionId, message: "Command started in background." }),
                metadata: { sessionId },
            };
        }

        // Wait up to yieldMs for foreground completion
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                // Auto-background: yield control
                const current = backgroundSessionManager.get(sessionId);
                const tail = current?.stdout.slice(-500) || "";
                resolve({
                    result: JSON.stringify({
                        status: "running",
                        sessionId,
                        message: "Command still running, auto-backgrounded.",
                        tail,
                    }),
                    metadata: { sessionId },
                });
            }, yieldMs);

            child.on("close", () => {
                clearTimeout(timer);
                const s = backgroundSessionManager.get(sessionId);
                if (s) {
                    resolve({
                        result: s.stdout || "(no output)",
                        metadata: { stderr: s.stderr || undefined, exitCode: s.exitCode, sessionId },
                    });
                } else {
                    resolve({ result: "Command completed." });
                }
            });
        });
    },
};
