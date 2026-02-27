/**
 * Agent Workspace Service — Manages file-based agent workspaces on disk.
 *
 * Each agent gets a directory at: {WORKSPACE_BASE_DIR}/{tenantId}/{agentId}/
 * containing SOUL.md (personality) and IDENTITY.md (name/role/background).
 *
 * All file changes are revision-tracked in the workspace_revisions DB table.
 */

import { mkdir, readFile, writeFile, access, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { db } from "../../storage/db.js";
import { workspaceRevisions, agentProfiles } from "../../storage/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { config } from "../../config.js";
import { logger } from "../../utils/logger.js";

const ALLOWED_FILE_NAMES = new Set(["SOUL.md", "IDENTITY.md", "MEMORY.md", "HEARTBEAT.md"]);
const KNOWLEDGE_FILE_PATTERN = /^KNOWLEDGE_[A-Z0-9_]+\.md$/;

function isAllowedFileName(fileName: string): boolean {
    return ALLOWED_FILE_NAMES.has(fileName) || KNOWLEDGE_FILE_PATTERN.test(fileName);
}

function sanitizeFileName(fileName: string): string {
    if (!isAllowedFileName(fileName)) {
        throw new Error(`Invalid workspace file name: ${fileName}`);
    }
    if (fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) {
        throw new Error(`Invalid characters in file name: ${fileName}`);
    }
    return fileName;
}

/** Available knowledge templates that can be added to agents */
export const KNOWLEDGE_TEMPLATES: Record<string, { displayName: string; fileName: string }> = {
    ERPNEXT: { displayName: "ERPNext API", fileName: "KNOWLEDGE_ERPNEXT.md" },
    QUICKBOOKS: { displayName: "QuickBooks API", fileName: "KNOWLEDGE_QUICKBOOKS.md" },
    PASTEL: { displayName: "Pastel API", fileName: "KNOWLEDGE_PASTEL.md" },
    XERO: { displayName: "Xero API", fileName: "KNOWLEDGE_XERO.md" },
    PYTHON_PATTERNS: { displayName: "Python Patterns", fileName: "KNOWLEDGE_PYTHON_PATTERNS.md" },
    REST_API: { displayName: "General REST API", fileName: "KNOWLEDGE_REST_API.md" },
};

/** Map template keys to source template files */
const TEMPLATE_SOURCE_MAP: Record<string, string> = {
    ERPNEXT: "ERPNEXT_API.md",
    QUICKBOOKS: "QUICKBOOKS_API.md",
    PASTEL: "PASTEL_API.md",
    XERO: "XERO_API.md",
    PYTHON_PATTERNS: "PYTHON_PATTERNS.md",
    REST_API: "REST_API_GENERAL.md",
};

function getSafeFilePath(workspacePath: string, fileName: string): string {
    const filePath = resolve(join(workspacePath, fileName));
    const resolvedBase = resolve(workspacePath);
    if (!filePath.startsWith(resolvedBase)) {
        throw new Error("Path traversal detected");
    }
    return filePath;
}

const DEFAULT_SOUL = `# Soul

You are a capable, independent AI assistant. Think before you respond and adapt to each situation naturally.

## Personality
- Friendly and genuine — never scripted or robotic
- Direct and helpful — get to the point
- Honest when uncertain — say so rather than guessing

## Communication Style
- Be conversational — vary your tone and structure based on context
- Match the user's energy: brief questions get brief answers, complex topics get thorough responses
- Never repeat the same opening phrase across messages
- Ask clarifying questions when genuinely needed, not as filler
`;

const DEFAULT_IDENTITY = `# Identity

- **Name**: AI Assistant
- **Role**: General Purpose Assistant
- **Background**: A versatile AI designed to help with a wide range of tasks
`;

export class WorkspaceService {
    private get baseDir(): string {
        return config.WORKSPACE_BASE_DIR;
    }

    private getWorkspacePath(tenantId: string, agentId: string): string {
        return join(this.baseDir, tenantId, agentId);
    }

    /**
     * Initialize a workspace directory with default files
     */
    async initializeWorkspace(
        tenantId: string,
        agentId: string,
        initialPrompt?: string
    ): Promise<string> {
        const workspacePath = this.getWorkspacePath(tenantId, agentId);

        await mkdir(workspacePath, { recursive: true });

        const soulContent = initialPrompt || DEFAULT_SOUL;
        const identityContent = DEFAULT_IDENTITY;

        // Write seed files
        await writeFile(join(workspacePath, "SOUL.md"), soulContent, "utf-8");
        await writeFile(join(workspacePath, "IDENTITY.md"), identityContent, "utf-8");

        // Record initial revisions
        await db.insert(workspaceRevisions).values([
            {
                agentProfileId: agentId,
                tenantId,
                fileName: "SOUL.md",
                content: soulContent,
                changeSummary: "Initial workspace creation",
                revisionNumber: 1,
            },
            {
                agentProfileId: agentId,
                tenantId,
                fileName: "IDENTITY.md",
                content: identityContent,
                changeSummary: "Initial workspace creation",
                revisionNumber: 1,
            },
        ]);

        // Update agent profile with workspace path
        await db.update(agentProfiles)
            .set({ workspacePath, updatedAt: new Date() })
            .where(eq(agentProfiles.id, agentId));

        logger.info({ tenantId, agentId, workspacePath }, "Workspace initialized");
        return workspacePath;
    }

    /**
     * Read a file from the agent's workspace
     */
    async readFile(tenantId: string, agentId: string, fileName: string): Promise<string | null> {
        const safe = sanitizeFileName(fileName);
        const workspacePath = this.getWorkspacePath(tenantId, agentId);
        const filePath = getSafeFilePath(workspacePath, safe);
        try {
            await access(filePath);
            return await readFile(filePath, "utf-8");
        } catch {
            return null;
        }
    }

    /**
     * Write a file to the agent's workspace and record a revision
     */
    async writeFile(
        tenantId: string,
        agentId: string,
        fileName: string,
        content: string,
        summary?: string,
        userId?: string
    ): Promise<void> {
        const safe = sanitizeFileName(fileName);
        const workspacePath = this.getWorkspacePath(tenantId, agentId);
        const filePath = getSafeFilePath(workspacePath, safe);
        await mkdir(workspacePath, { recursive: true });

        // Write to disk
        await writeFile(filePath, content, "utf-8");

        // Get next revision number
        const lastRevision = await db.query.workspaceRevisions.findFirst({
            where: and(
                eq(workspaceRevisions.agentProfileId, agentId),
                eq(workspaceRevisions.fileName, fileName)
            ),
            orderBy: [desc(workspaceRevisions.revisionNumber)],
        });
        const nextRevision = (lastRevision?.revisionNumber ?? 0) + 1;

        // Record revision
        await db.insert(workspaceRevisions).values({
            agentProfileId: agentId,
            tenantId,
            fileName,
            content,
            changeSummary: summary || `Updated ${fileName}`,
            changedBy: userId || null,
            revisionNumber: nextRevision,
        });

        // If SOUL.md changed, sync to legacy systemPrompt column for backward compatibility
        if (fileName === "SOUL.md") {
            await db.update(agentProfiles)
                .set({ systemPrompt: content, updatedAt: new Date() })
                .where(eq(agentProfiles.id, agentId));
        }

        logger.info({ tenantId, agentId, fileName, revision: nextRevision }, "Workspace file updated");
    }

    /**
     * Build a composite system prompt from workspace files.
     * Combines IDENTITY.md + SOUL.md + MEMORY.md into one system prompt.
     * Falls back to legacy DB systemPrompt if workspace doesn't exist.
     */
    /**
     * Extract the agent's display name from IDENTITY.md content.
     * Looks for "- **Name**: <value>" pattern.
     */
    private extractName(identityContent: string): string | null {
        const match = identityContent.match(/\*\*Name\*\*:\s*(.+)/i);
        return match ? match[1].trim() : null;
    }

    async buildSystemPrompt(tenantId: string, agentId: string): Promise<string | null> {
        const workspacePath = this.getWorkspacePath(tenantId, agentId);
        logger.debug({ tenantId, agentId, workspacePath, cwd: process.cwd() }, "Building system prompt from workspace");

        const identity = await this.readFile(tenantId, agentId, "IDENTITY.md");
        const soul = await this.readFile(tenantId, agentId, "SOUL.md");
        const memory = await this.readFile(tenantId, agentId, "MEMORY.md");

        logger.debug({
            hasIdentity: !!identity,
            hasSoul: !!soul,
            hasMemory: !!memory,
            identityLen: identity?.length ?? 0,
            soulLen: soul?.length ?? 0,
            memoryLen: memory?.length ?? 0,
        }, "Workspace files loaded");

        if (!identity && !soul && !memory) {
            logger.warn({ workspacePath }, "No workspace files found — falling back to DB systemPrompt");
            return null;
        }

        // Extract the authoritative name from IDENTITY.md, fallback to SOUL.md
        let agentName = identity ? this.extractName(identity) : null;

        // If IDENTITY.md has the default name, try to extract from SOUL.md
        // (e.g. "You are Sentinel Voss, Head of IT..." → "Sentinel Voss")
        if ((!agentName || agentName === "AI Assistant") && soul) {
            const soulNameMatch = soul.match(/^You are ([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)/m);
            if (soulNameMatch) {
                agentName = soulNameMatch[1];
            }
        }

        const parts: string[] = [];

        // Identity directive comes first — this is the single source of truth
        if (identity) {
            parts.push(identity);
        }

        // If IDENTITY.md specifies a name, inject a strong identity override.
        // This ensures the LLM uses the IDENTITY.md name even if SOUL.md
        // contains a stale or different name.
        if (agentName) {
            parts.push(
                `# IDENTITY OVERRIDE (AUTHORITATIVE)\n` +
                `Your name is ${agentName}. Always introduce yourself as ${agentName}. ` +
                `If the user asks who you are, you are ${agentName}. ` +
                `Ignore any conflicting name references in other instructions.`
            );
        }

        if (soul) {
            parts.push(soul);
        }

        // Dynamic behavior directive — prevents robotic, scripted responses
        parts.push(
            `# RESPONSE GUIDELINES\n` +
            `- Be natural and conversational. Never repeat the same phrase across messages.\n` +
            `- Vary your opening, tone, and structure based on context.\n` +
            `- Do NOT use scripted phrases verbatim from your personality instructions — treat them as general guidance, not templates to copy.\n` +
            `- Adapt your empathy and tone to what the user actually said, not with a formulaic opener.\n` +
            `- Be a thinking, independent agent — read the situation and respond accordingly.`
        );

        if (memory) {
            parts.push(`# Persistent Memory\n\nThe following is your persistent memory — facts, preferences, and context you've accumulated. Use this information when relevant to conversations.\n\n${memory}`);
        }

        // Load knowledge files (KNOWLEDGE_*.md)
        const knowledgeFiles = await this.listKnowledgeFiles(tenantId, agentId);
        if (knowledgeFiles.length > 0) {
            const knowledgeParts: string[] = [];
            for (const kf of knowledgeFiles) {
                const content = await this.readFile(tenantId, agentId, kf);
                if (content) {
                    knowledgeParts.push(content);
                }
            }
            if (knowledgeParts.length > 0) {
                parts.push(`# API Knowledge\n\nReference documentation for APIs you may need to work with:\n\n${knowledgeParts.join("\n\n---\n\n")}`);
            }
        }

        const prompt = parts.join("\n\n---\n\n");
        logger.info({ tenantId, agentId, promptLength: prompt.length, fileCount: parts.length, agentName: agentName ?? "unset" }, "Workspace system prompt built successfully");
        return prompt;
    }

    /**
     * Add a knowledge template to an agent's workspace.
     * Copies from templates/ directory to workspace as KNOWLEDGE_{name}.md
     */
    async addTemplate(
        tenantId: string,
        agentId: string,
        templateKey: string,
        userId?: string
    ): Promise<void> {
        const sourceFile = TEMPLATE_SOURCE_MAP[templateKey];
        const template = KNOWLEDGE_TEMPLATES[templateKey];
        if (!sourceFile || !template) {
            throw new Error(`Unknown template: ${templateKey}`);
        }

        const templatesDir = join(import.meta.dirname || __dirname, "templates");
        const sourcePath = join(templatesDir, sourceFile);

        let content: string;
        try {
            content = await readFile(sourcePath, "utf-8");
        } catch {
            throw new Error(`Template file not found: ${sourceFile}`);
        }

        await this.writeFile(tenantId, agentId, template.fileName, content, `Added ${template.displayName} knowledge template`, userId);
    }

    /**
     * Remove a knowledge file from an agent's workspace.
     */
    async removeKnowledgeFile(
        tenantId: string,
        agentId: string,
        fileName: string,
        userId?: string
    ): Promise<void> {
        if (!KNOWLEDGE_FILE_PATTERN.test(fileName)) {
            throw new Error("Can only remove KNOWLEDGE_*.md files");
        }
        const workspacePath = this.getWorkspacePath(tenantId, agentId);
        const filePath = getSafeFilePath(workspacePath, fileName);
        const { unlink } = await import("node:fs/promises");
        try {
            await unlink(filePath);
        } catch {
            // File may not exist on disk
        }
        logger.info({ tenantId, agentId, fileName }, "Knowledge file removed");
    }

    /**
     * List all knowledge files in an agent's workspace.
     */
    async listKnowledgeFiles(tenantId: string, agentId: string): Promise<string[]> {
        const workspacePath = this.getWorkspacePath(tenantId, agentId);
        try {
            const files = await readdir(workspacePath);
            return files.filter((f) => KNOWLEDGE_FILE_PATTERN.test(f));
        } catch {
            return [];
        }
    }

    /**
     * Get revision history for a specific file
     */
    async getRevisions(agentId: string, fileName: string) {
        return db.select()
            .from(workspaceRevisions)
            .where(
                and(
                    eq(workspaceRevisions.agentProfileId, agentId),
                    eq(workspaceRevisions.fileName, fileName)
                )
            )
            .orderBy(desc(workspaceRevisions.revisionNumber));
    }

    /**
     * Restore a file from a previous revision
     */
    async restoreRevision(tenantId: string, agentId: string, revisionId: string): Promise<void> {
        const revision = await db.query.workspaceRevisions.findFirst({
            where: eq(workspaceRevisions.id, revisionId),
        });

        if (!revision) {
            throw new Error(`Revision ${revisionId} not found`);
        }

        await this.writeFile(
            tenantId,
            agentId,
            revision.fileName,
            revision.content,
            `Restored from revision #${revision.revisionNumber}`
        );
    }

    /**
     * Check if a workspace exists for the given agent
     */
    async workspaceExists(tenantId: string, agentId: string): Promise<boolean> {
        const workspacePath = this.getWorkspacePath(tenantId, agentId);
        try {
            await access(workspacePath);
            return true;
        } catch {
            return false;
        }
    }
}

export const workspaceService = new WorkspaceService();
