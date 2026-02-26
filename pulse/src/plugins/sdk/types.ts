/**
 * Plugin SDK Types — interfaces for plugin authors.
 */

import { Tool } from "../../agent/tools/tool.interface.js";

export interface PluginCredentialField {
    name: string;
    label: string;
    type: "url" | "text" | "secret";
    placeholder?: string;
    required?: boolean;
    helpText?: string;
}

export interface PluginManifest {
    name: string;
    version: string;
    description: string;
    author?: string;
    tools?: Tool[];
    hooks?: Partial<PluginHooks>;
    routes?: PluginRoute[];
    credentialSchema?: PluginCredentialField[];
}

export interface PluginContext {
    config: Record<string, any>;
    logger: any; // pino logger scoped to plugin
}

export interface PluginRoute {
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    path: string;
    handler: (request: any, reply: any) => Promise<any>;
}

export interface PromptContext {
    tenantId: string;
    agentProfileId?: string;
    systemPrompt: string;
    messages: Array<{ role: string; content: string }>;
}

export interface ToolCallContext {
    tenantId: string;
    toolName: string;
    args: Record<string, any>;
}

export interface ToolResultContext {
    tenantId: string;
    toolName: string;
    result: string;
}

export interface LLMInputContext {
    tenantId: string;
    model: string;
    systemPrompt: string;
    messages: any[];
}

export interface LLMOutputContext {
    tenantId: string;
    model: string;
    content: string;
    usage: { inputTokens: number; outputTokens: number };
}

export interface MessageContext {
    tenantId: string;
    channelType: string;
    content: string;
    contactId: string;
}

export interface GatewayContext {
    server: any; // Fastify instance
}

export interface PluginHooks {
    "before-prompt-build": (ctx: PromptContext) => Promise<PromptContext | null>;
    "before-tool-call": (ctx: ToolCallContext) => Promise<ToolCallContext | null>;
    "after-tool-call": (ctx: ToolResultContext) => Promise<void>;
    "llm-input": (ctx: LLMInputContext) => Promise<LLMInputContext | null>;
    "llm-output": (ctx: LLMOutputContext) => Promise<void>;
    "message-received": (ctx: MessageContext) => Promise<MessageContext | null>;
    "message-sending": (ctx: MessageContext) => Promise<MessageContext | null>;
    "gateway-start": (ctx: GatewayContext) => Promise<void>;
    "gateway-stop": () => Promise<void>;
}
