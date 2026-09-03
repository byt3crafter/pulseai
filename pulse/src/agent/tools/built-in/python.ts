/**
 * Python Execute tool — run Python code in a sandboxed Docker container.
 * Credentials are injected as environment variables.
 */

import { Tool } from "../tool.interface.js";
import { execFile } from "child_process";
import { promisify } from "util";
import { logger } from "../../../utils/logger.js";
import { sanitizeExecError } from "./exec-error.js";
import { evaluate } from "../safety/exec-policy.js";
import { credentialVault } from "../credential-vault.js";
import { config } from "../../../config.js";

const execFileAsync = promisify(execFile);

const PYTHON_IMAGE = config.PYTHON_SANDBOX_IMAGE;

export const pythonExecuteTool: Tool = {
    name: "python_execute",
    description:
        "Execute Python code in a sandboxed Docker container. " +
        "API credentials are available as environment variables (use os.environ['KEY_NAME']). " +
        "Use credential_list tool first to see available credentials. " +
        "Pre-installed packages: requests, pandas, openpyxl, sqlalchemy, beautifulsoup4, httpx, pydantic, tabulate.",
    parameters: {
        type: "object",
        properties: {
            code: {
                type: "string",
                description: "Python code to execute",
            },
            packages: {
                type: "array",
                items: { type: "string" },
                description: "Additional pip packages to install before execution",
            },
            timeout: {
                type: "number",
                description: "Timeout in seconds (default: 60, max: 300)",
            },
        },
        required: ["code"],
    },
    execute: async ({ tenantId, conversationId, args }) => {
        const { code, packages = [], timeout = 60 } = args;
        const effectiveTimeout = Math.min(timeout, 300) * 1000;

        // Safety check on the Python code
        const decision = await evaluate(code, { tenantId, conversationId });
        if (!decision.allowed) {
            return { result: `Python code blocked by safety policy: ${decision.reason}` };
        }

        try {
            // Build env var flags from vault
            const envFlags: string[] = [];
            try {
                const envVars = await credentialVault.getEnvVars(tenantId);
                for (const [key, value] of Object.entries(envVars)) {
                    envFlags.push("-e", `${key}=${value}`);
                }
            } catch (err) {
                logger.warn({ err, tenantId }, "Failed to load vault credentials for Python sandbox");
            }

            // Build the command. The code is passed as its own argv element (no
            // shell) so quotes/newlines survive and nothing needs escaping.
            let script = "python3 -c \"$0\"";
            if (packages.length > 0) {
                const pkgList = packages.join(" ");
                script = `pip install --quiet ${pkgList} 2>/dev/null && ${script}`;
            }

            const dockerArgs = [
                "run", "--rm",
                "--memory=256m",
                "--cpus=1.0",
                "--network=bridge", // Allow network for API calls
                ...envFlags,
                PYTHON_IMAGE,
                "sh", "-c", script, code,
            ];

            const { stdout, stderr } = await execFileAsync("docker", dockerArgs, {
                timeout: effectiveTimeout,
                maxBuffer: 10 * 1024 * 1024,
            });

            return {
                result: stdout || "Python script executed successfully (no output).",
                metadata: { stderr: stderr || undefined },
            };
        } catch (err: any) {
            // Never log or return err.message / err.cmd: for child_process errors
            // they contain the full `docker run -e KEY=VALUE …` line, i.e. every
            // vault secret in plaintext.
            const safe = sanitizeExecError(err);
            logger.error({ ...safe, tenantId }, "Python execution failed");
            if (err.killed) {
                return { result: `Error: Python script timed out after ${timeout}s.` };
            }
            return {
                result: `Error: Python execution failed (exit ${safe.code ?? "?"})\n${safe.stderr || "No stderr output."}`,
            };
        }
    },
};
