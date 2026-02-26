/**
 * Sandbox Configuration — enhanced Docker sandbox settings per agent.
 */

export interface SandboxConfig {
    mode: "off" | "non-main" | "all";
    scope: "session" | "agent" | "shared";
    workspaceAccess: "none" | "ro" | "rw";
    docker?: {
        image?: string;
        memoryLimit?: string;
        cpuLimit?: string;
        setupCommand?: string;
    };
}

export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
    mode: "off",
    scope: "session",
    workspaceAccess: "none",
};

export function parseSandboxConfig(raw: any): SandboxConfig {
    if (!raw || typeof raw !== "object") return DEFAULT_SANDBOX_CONFIG;
    return {
        mode: ["off", "non-main", "all"].includes(raw.mode) ? raw.mode : "off",
        scope: ["session", "agent", "shared"].includes(raw.scope) ? raw.scope : "session",
        workspaceAccess: ["none", "ro", "rw"].includes(raw.workspaceAccess) ? raw.workspaceAccess : "none",
        docker: raw.docker ? {
            image: raw.docker.image || undefined,
            memoryLimit: raw.docker.memoryLimit || undefined,
            cpuLimit: raw.docker.cpuLimit || undefined,
            setupCommand: raw.docker.setupCommand || undefined,
        } : undefined,
    };
}
