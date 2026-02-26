/**
 * Plugin SDK — public API for plugin authors.
 */

import type { PluginManifest } from "./types.js";

export function definePlugin(manifest: PluginManifest): PluginManifest {
    return manifest;
}

export type {
    PluginManifest,
    PluginCredentialField,
    PluginContext,
    PluginHooks,
    PluginRoute,
    PromptContext,
    ToolCallContext,
    ToolResultContext,
    LLMInputContext,
    LLMOutputContext,
    MessageContext,
    GatewayContext,
} from "./types.js";
