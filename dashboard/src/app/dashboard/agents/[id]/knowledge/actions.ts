"use server";

import { revalidatePath } from "next/cache";
import { readdir, readFile, writeFile, unlink, mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import { db } from "../../../../../storage/db";
import { agentProfiles } from "../../../../../storage/schema";
import { eq } from "drizzle-orm";

const KNOWLEDGE_FILE_PATTERN = /^KNOWLEDGE_[A-Z0-9_]+\.md$/;

const WORKSPACE_BASE = process.env.WORKSPACE_BASE_DIR || "../data/workspaces";

const TEMPLATES: Record<string, { displayName: string; fileName: string; sourceFile: string }> = {
    ERPNEXT: { displayName: "ERPNext API", fileName: "KNOWLEDGE_ERPNEXT.md", sourceFile: "ERPNEXT_API.md" },
    QUICKBOOKS: { displayName: "QuickBooks API", fileName: "KNOWLEDGE_QUICKBOOKS.md", sourceFile: "QUICKBOOKS_API.md" },
    PASTEL: { displayName: "Pastel API", fileName: "KNOWLEDGE_PASTEL.md", sourceFile: "PASTEL_API.md" },
    XERO: { displayName: "Xero API", fileName: "KNOWLEDGE_XERO.md", sourceFile: "XERO_API.md" },
    PYTHON_PATTERNS: { displayName: "Python Patterns", fileName: "KNOWLEDGE_PYTHON_PATTERNS.md", sourceFile: "PYTHON_PATTERNS.md" },
    REST_API: { displayName: "General REST API", fileName: "KNOWLEDGE_REST_API.md", sourceFile: "REST_API_GENERAL.md" },
};

export async function getTemplates() {
    return TEMPLATES;
}

function getWorkspacePath(tenantId: string, agentId: string): string {
    return join(WORKSPACE_BASE, tenantId, agentId);
}

export async function getKnowledgeFiles(tenantId: string, agentId: string) {
    const ws = getWorkspacePath(tenantId, agentId);
    try {
        const files = await readdir(ws);
        const knowledgeFiles = files.filter((f) => KNOWLEDGE_FILE_PATTERN.test(f));
        const result: { name: string; content: string }[] = [];
        for (const f of knowledgeFiles) {
            const content = await readFile(join(ws, f), "utf-8");
            result.push({ name: f, content });
        }
        return result;
    } catch {
        return [];
    }
}

export async function addKnowledgeTemplate(formData: FormData) {
    const agentId = formData.get("agentId") as string;
    const tenantId = formData.get("tenantId") as string;
    const templateKey = formData.get("templateKey") as string;

    const tmpl = TEMPLATES[templateKey];
    if (!tmpl) return;

    // Read source template — resolve relative to the pulse workspace templates
    const templatesDir = join(process.cwd(), "..", "pulse", "src", "agent", "workspace", "templates");
    let content: string;
    try {
        content = await readFile(join(templatesDir, tmpl.sourceFile), "utf-8");
    } catch {
        // Fallback: try relative from workspace base
        content = `# ${tmpl.displayName}\n\n(Template content not available — please configure manually.)`;
    }

    const ws = getWorkspacePath(tenantId, agentId);
    await mkdir(ws, { recursive: true });
    await writeFile(join(ws, tmpl.fileName), content, "utf-8");

    revalidatePath(`/dashboard/agents/${agentId}/knowledge`);
}

export async function updateKnowledgeFile(formData: FormData) {
    const agentId = formData.get("agentId") as string;
    const tenantId = formData.get("tenantId") as string;
    const fileName = formData.get("fileName") as string;
    const content = formData.get("content") as string;

    if (!KNOWLEDGE_FILE_PATTERN.test(fileName)) return;

    const ws = getWorkspacePath(tenantId, agentId);
    await writeFile(join(ws, fileName), content, "utf-8");

    revalidatePath(`/dashboard/agents/${agentId}/knowledge`);
}

export async function removeKnowledgeFile(formData: FormData) {
    const agentId = formData.get("agentId") as string;
    const tenantId = formData.get("tenantId") as string;
    const fileName = formData.get("fileName") as string;

    if (!KNOWLEDGE_FILE_PATTERN.test(fileName)) return;

    const ws = getWorkspacePath(tenantId, agentId);
    try {
        await unlink(join(ws, fileName));
    } catch {}

    revalidatePath(`/dashboard/agents/${agentId}/knowledge`);
}

export async function addCustomKnowledge(formData: FormData) {
    const agentId = formData.get("agentId") as string;
    const tenantId = formData.get("tenantId") as string;
    const name = (formData.get("name") as string).toUpperCase().replace(/[^A-Z0-9_]/g, "_");

    const fileName = `KNOWLEDGE_${name}.md`;
    const content = `# ${name}\n\n(Add your API documentation or reference material here.)`;

    const ws = getWorkspacePath(tenantId, agentId);
    await mkdir(ws, { recursive: true });
    await writeFile(join(ws, fileName), content, "utf-8");

    revalidatePath(`/dashboard/agents/${agentId}/knowledge`);
}
