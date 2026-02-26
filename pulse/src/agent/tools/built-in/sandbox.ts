import { Tool } from "../tool.interface.js";
import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "../../../utils/logger.js";
import { parseSandboxConfig } from "./sandbox-config.js";
import { evaluate } from "../safety/exec-policy.js";
import { credentialVault } from "../credential-vault.js";

const execAsync = promisify(exec);

export function createSandboxTool(sandboxConfig?: any, workspacePath?: string): Tool {
    const cfg = parseSandboxConfig(sandboxConfig);

    return {
        name: "bash_sandbox",
        description: "Executes a bash script in an isolated, ephemeral Docker sidecar container. Use this for complex data transformations, pinging servers, or running isolated code.",
        parameters: {
            type: "object",
            properties: {
                script: {
                    type: "string",
                    description: "The bash script to execute."
                },
                timeout: {
                    type: "number",
                    description: "Optional maximum execution time in milliseconds (default: 10000)"
                }
            },
            required: ["script"]
        },
        execute: async ({ args, tenantId, conversationId }) => {
            const { script, timeout = 10000 } = args;

            // Exec safety check on the script content
            const decision = await evaluate(script, { tenantId, conversationId });
            if (!decision.allowed) {
                logger.warn({ tenantId, script: script.substring(0, 200), reason: decision.reason }, "Sandbox script blocked by safety policy");
                return { result: `Script blocked by safety policy: ${decision.reason}` };
            }

            logger.warn({ tenantId, mode: cfg.mode }, "Executing sandboxed bash script");

            try {
                const image = cfg.docker?.image || "alpine";
                const memory = cfg.docker?.memoryLimit || "128m";
                const cpus = cfg.docker?.cpuLimit || "0.5";

                const dockerArgs = ["run", "--rm", `--memory=${memory}`, `--cpus=${cpus}`];

                // Inject vault credentials as env vars
                try {
                    const envVars = await credentialVault.getEnvVars(tenantId);
                    for (const [key, value] of Object.entries(envVars)) {
                        dockerArgs.push("-e", `${key}=${value}`);
                    }
                } catch (err) {
                    logger.warn({ err, tenantId }, "Failed to inject vault credentials into sandbox");
                }

                // Workspace bind mount
                if (workspacePath && cfg.workspaceAccess !== "none") {
                    const ro = cfg.workspaceAccess === "ro" ? ":ro" : "";
                    dockerArgs.push("-v", `${workspacePath}:/workspace${ro}`);
                }

                // Setup command
                let fullScript = script;
                if (cfg.docker?.setupCommand) {
                    fullScript = `${cfg.docker.setupCommand} && ${script}`;
                }
                const escapedScript = fullScript.replace(/'/g, "'\\''");

                dockerArgs.push(image, "sh", "-c", escapedScript);
                const cmd = `docker ${dockerArgs.join(" ")}`;

                const { stdout, stderr } = await execAsync(cmd, { timeout });

                return {
                    result: stdout || "Script executed successfully with no stdout output.",
                    metadata: { stderr: stderr || undefined }
                };
            } catch (err: any) {
                logger.error({ err, tenantId }, "Sandboxed execution failed");
                if (err.killed) {
                    return { result: "Error: Script execution timed out." };
                }
                return {
                    result: `Error executing script: ${err.message}\nStderr: ${err.stderr || ""}`
                };
            }
        }
    };
}

// Legacy export for backward compatibility
export const sandboxTool: Tool = createSandboxTool();
