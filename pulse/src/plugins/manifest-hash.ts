/**
 * Manifest integrity — a content hash over a plugin's *capabilities* (tools,
 * hooks, routes, credentials, declared permissions). Used to detect drift: if
 * a plugin update changes what it can do, the hash changes and the plugin must
 * be re-approved by an admin before its capabilities are registered again.
 * Version alone does NOT change the hash (only capability/permission changes do).
 */
import { createHash } from "crypto";
import { PluginManifest } from "./sdk/types.js";

export interface CapabilitySummary {
    tools: string[];
    hooks: string[];
    routes: string[];
    credentials: string[];
    permissions: { network: string[]; filesystem: string[]; commands: string[] };
}

export function summarizeCapabilities(m: PluginManifest): CapabilitySummary {
    return {
        tools: (m.tools ?? []).map((t) => t.name).sort(),
        hooks: m.hooks ? Object.keys(m.hooks).sort() : [],
        routes: (m.routes ?? []).map((r) => `${r.method} ${r.path}`).sort(),
        credentials: (m.credentialSchema ?? []).map((c) => c.name).sort(),
        permissions: {
            network: (m.permissions?.network ?? []).slice().sort(),
            filesystem: (m.permissions?.filesystem ?? []).slice().sort(),
            commands: (m.permissions?.commands ?? []).slice().sort(),
        },
    };
}

export function computeManifestHash(m: PluginManifest): string {
    const canonical = JSON.stringify({ name: m.name, ...summarizeCapabilities(m) });
    return createHash("sha256").update(canonical).digest("hex");
}
