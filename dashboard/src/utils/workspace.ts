/**
 * Workspace filesystem utility for the dashboard.
 * Thin wrapper around fs operations for reading/writing agent workspace files.
 */

import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { config } from "../config";

const ALLOWED_FILE_NAMES = new Set(["SOUL.md", "IDENTITY.md", "MEMORY.md", "HEARTBEAT.md"]);

function sanitizeFileName(fileName: string): string {
    if (!ALLOWED_FILE_NAMES.has(fileName)) {
        throw new Error(`Invalid workspace file name: ${fileName}`);
    }
    if (fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) {
        throw new Error(`Invalid characters in file name: ${fileName}`);
    }
    return fileName;
}

function getWorkspacePath(tenantId: string, agentId: string): string {
    return join(config.WORKSPACE_BASE_DIR, tenantId, agentId);
}

function getSafeFilePath(workspacePath: string, fileName: string): string {
    const filePath = resolve(join(workspacePath, fileName));
    const resolvedBase = resolve(workspacePath);
    if (!filePath.startsWith(resolvedBase)) {
        throw new Error("Path traversal detected");
    }
    return filePath;
}

export async function readWorkspaceFile(
    tenantId: string,
    agentId: string,
    fileName: string
): Promise<string | null> {
    const safe = sanitizeFileName(fileName);
    const workspacePath = getWorkspacePath(tenantId, agentId);
    const filePath = getSafeFilePath(workspacePath, safe);
    try {
        await access(filePath);
        return await readFile(filePath, "utf-8");
    } catch {
        return null;
    }
}

export async function writeWorkspaceFile(
    tenantId: string,
    agentId: string,
    fileName: string,
    content: string
): Promise<void> {
    const safe = sanitizeFileName(fileName);
    const workspacePath = getWorkspacePath(tenantId, agentId);
    const filePath = getSafeFilePath(workspacePath, safe);
    await mkdir(workspacePath, { recursive: true });
    await writeFile(filePath, content, "utf-8");
}

export async function workspaceExists(
    tenantId: string,
    agentId: string
): Promise<boolean> {
    const workspacePath = getWorkspacePath(tenantId, agentId);
    try {
        await access(workspacePath);
        return true;
    } catch {
        return false;
    }
}

export async function initializeWorkspace(
    tenantId: string,
    agentId: string,
    initialSoul?: string
): Promise<string> {
    const workspacePath = getWorkspacePath(tenantId, agentId);
    await mkdir(workspacePath, { recursive: true });

    const soulContent = initialSoul || `# Soul

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

    const identityContent = `# Identity

- **Name**: AI Assistant
- **Role**: General Purpose Assistant
- **Background**: A versatile AI designed to help with a wide range of tasks
`;

    const memoryContent = `# Memory

This file stores persistent memory for the agent across conversations.

## Key Facts

## Learned Preferences

## Important Context
`;

    await writeFile(join(workspacePath, "SOUL.md"), soulContent, "utf-8");
    await writeFile(join(workspacePath, "IDENTITY.md"), identityContent, "utf-8");
    await writeFile(join(workspacePath, "MEMORY.md"), memoryContent, "utf-8");

    return workspacePath;
}
