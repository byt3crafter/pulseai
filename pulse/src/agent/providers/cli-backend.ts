/**
 * CLI Backend Provider — shells out to local CLI tools (claude, codex).
 * Text-only, no tool support. Used as last-resort fallback.
 */

import { spawn } from "child_process";
import { logger } from "../../utils/logger.js";
import { CLIBackendConfig, CLI_BACKEND_DEFAULTS } from "./cli-backend-config.js";
import { ProviderResponse } from "./anthropic.js";

export class CLIBackendProvider {
    name = "cli-backend";

    async chat(params: {
        model: string;
        systemPrompt: string;
        messages: Array<{ role: string; content: string }>;
        cliConfig?: CLIBackendConfig;
    }): Promise<ProviderResponse> {
        const configKey = params.model.startsWith("cli:") ? params.model.slice(4) : "claude-cli";
        const cfg = params.cliConfig || CLI_BACKEND_DEFAULTS[configKey] || CLI_BACKEND_DEFAULTS["claude-cli"];

        const lastUserMsg = [...params.messages].reverse().find(m => m.role === "user");
        const prompt = lastUserMsg?.content || "";

        if (!prompt) {
            return { content: "No user message to process.", model: params.model, usage: { inputTokens: 0, outputTokens: 0 } };
        }

        const log = logger.child({ component: "cli-backend", command: cfg.command });

        return new Promise((resolve) => {
            const args = [...(cfg.args || [])];
            if (cfg.inputMode === "arg") {
                args.push(prompt);
            }

            log.debug({ command: cfg.command, args }, "Spawning CLI backend");

            const child = spawn(cfg.command, args, {
                timeout: 120_000,
                stdio: ["pipe", "pipe", "pipe"],
            });

            let stdout = "";
            let stderr = "";

            child.stdout?.on("data", (data: Buffer) => { stdout += data.toString(); });
            child.stderr?.on("data", (data: Buffer) => { stderr += data.toString(); });

            if (cfg.inputMode === "stdin") {
                child.stdin?.write(prompt);
                child.stdin?.end();
            }

            child.on("close", (code) => {
                if (code !== 0) {
                    log.warn({ code, stderr }, "CLI backend exited with non-zero code");
                }

                const content = stdout.trim() || stderr.trim() || "(No output from CLI backend)";

                resolve({
                    content,
                    model: params.model,
                    usage: {
                        inputTokens: Math.ceil(prompt.length / 4),
                        outputTokens: Math.ceil(content.length / 4),
                    },
                });
            });

            child.on("error", (err) => {
                log.error({ err }, "CLI backend spawn failed");
                resolve({
                    content: `CLI backend error: ${err.message}`,
                    model: params.model,
                    usage: { inputTokens: 0, outputTokens: 0 },
                });
            });
        });
    }
}
