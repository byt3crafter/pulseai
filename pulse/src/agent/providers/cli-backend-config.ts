/**
 * CLI Backend default configurations for claude-cli and codex-cli.
 */

export interface CLIBackendConfig {
    command: string;
    args?: string[];
    inputMode: "stdin" | "arg";
    outputMode: "stdout" | "json";
}

export const CLI_BACKEND_DEFAULTS: Record<string, CLIBackendConfig> = {
    "claude-cli": {
        command: "claude",
        args: ["-p"],
        inputMode: "arg",
        outputMode: "stdout",
    },
    "codex-cli": {
        command: "codex",
        args: [],
        inputMode: "stdin",
        outputMode: "stdout",
    },
};
