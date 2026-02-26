/**
 * Script persistence tools — agents can save, load, and list reusable scripts.
 */

import { Tool } from "../tool.interface.js";
import { db } from "../../../storage/db.js";
import { agentScripts } from "../../../storage/schema.js";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "../../../utils/logger.js";

export const scriptSaveTool: Tool = {
    name: "script_save",
    description:
        "Save a working script for future reuse. The script is stored in the database and can be loaded later with script_load.",
    parameters: {
        type: "object",
        properties: {
            filename: { type: "string", description: "Script filename (e.g., 'get_unpaid_invoices.py')" },
            code: { type: "string", description: "The script code to save" },
            description: { type: "string", description: "What this script does" },
            language: { type: "string", description: "Programming language (default: python)" },
        },
        required: ["filename", "code"],
    },
    execute: async ({ tenantId, conversationId, args }) => {
        const { filename, code, description, language = "python" } = args;

        // We need the agentId — extract from conversation metadata or use conversationId as fallback
        // In practice, the runtime should pass agentId through the tool context
        const agentId = (args as any)._agentId || conversationId;

        try {
            await db
                .insert(agentScripts)
                .values({
                    tenantId,
                    agentId,
                    filename,
                    code,
                    description: description || null,
                    language,
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: [agentScripts.agentId, agentScripts.filename],
                    set: {
                        code,
                        description: description || null,
                        language,
                        updatedAt: new Date(),
                    },
                });

            return { result: `Script '${filename}' saved successfully.` };
        } catch (err: any) {
            logger.error({ err, tenantId, filename }, "Failed to save script");
            return { result: `Error saving script: ${err.message}` };
        }
    },
};

export const scriptLoadTool: Tool = {
    name: "script_load",
    description: "Load a previously saved script by filename.",
    parameters: {
        type: "object",
        properties: {
            filename: { type: "string", description: "Script filename to load" },
        },
        required: ["filename"],
    },
    execute: async ({ tenantId, conversationId, args }) => {
        const { filename } = args;
        const agentId = (args as any)._agentId || conversationId;

        try {
            const script = await db.query.agentScripts.findFirst({
                where: and(
                    eq(agentScripts.agentId, agentId),
                    eq(agentScripts.filename, filename)
                ),
            });

            if (!script) {
                return { result: `Script '${filename}' not found. Use script_list to see available scripts.` };
            }

            // Increment use count
            await db
                .update(agentScripts)
                .set({
                    useCount: sql`${agentScripts.useCount} + 1`,
                    lastUsedAt: new Date(),
                })
                .where(eq(agentScripts.id, script.id));

            return {
                result: `# ${filename}\n# ${script.description || "No description"}\n\n${script.code}`,
            };
        } catch (err: any) {
            logger.error({ err, tenantId, filename }, "Failed to load script");
            return { result: `Error loading script: ${err.message}` };
        }
    },
};

export const scriptListTool: Tool = {
    name: "script_list",
    description: "List all saved scripts for this agent.",
    parameters: {
        type: "object",
        properties: {},
        required: [],
    },
    execute: async ({ tenantId, conversationId, args }) => {
        const agentId = (args as any)._agentId || conversationId;

        try {
            const scripts = await db.query.agentScripts.findMany({
                where: eq(agentScripts.agentId, agentId),
                columns: {
                    filename: true,
                    description: true,
                    language: true,
                    lastUsedAt: true,
                    useCount: true,
                },
            });

            if (scripts.length === 0) {
                return { result: "No saved scripts. Use script_save to store a working script for reuse." };
            }

            const lines = scripts.map((s) => {
                const used = s.lastUsedAt ? `last used ${new Date(s.lastUsedAt).toLocaleDateString()}` : "never used";
                return `- ${s.filename} [${s.language}] (${used}, ${s.useCount || 0} uses): ${s.description || "No description"}`;
            });

            return { result: `Saved scripts:\n${lines.join("\n")}` };
        } catch (err: any) {
            logger.error({ err, tenantId }, "Failed to list scripts");
            return { result: `Error listing scripts: ${err.message}` };
        }
    },
};
