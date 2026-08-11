/**
 * Notepad tools — freeform notes the agent can jot down and recall later.
 * Per-tenant; passwords/secrets do NOT belong here (use the vault).
 */

import { Tool } from "../tool.interface.js";
import { db } from "../../../storage/db.js";
import { notes } from "../../../storage/schema.js";
import { and, eq, desc, ilike, or } from "drizzle-orm";

const previewLine = (r: { id: string; title: string | null; body: string; pinned: boolean | null }) => {
    const head = (r.title && r.title.trim()) || r.body.replace(/\s+/g, " ").slice(0, 50);
    const snippet = r.body.replace(/\s+/g, " ").slice(0, 140);
    return `- ${r.pinned ? "📌 " : ""}${head} — ${snippet}${r.body.length > 140 ? "…" : ""} [id: ${r.id}]`;
};

export const noteSaveTool: Tool = {
    name: "note_save",
    source: "builtin",
    description:
        "Save a note to the notepad, or update an existing one (pass its id). Use for anything the user wants remembered as text — meeting notes, ideas, drafts. Not for passwords (use the vault).",
    parameters: {
        type: "object",
        properties: {
            body: { type: "string", description: "The note content." },
            title: { type: "string", description: "Optional short title." },
            tags: { type: "string", description: "Optional comma-separated tags." },
            pinned: { type: "boolean", description: "Pin the note to the top." },
            id: { type: "string", description: "Id of an existing note to update (omit to create new)." },
        },
        required: ["body"],
    },
    execute: async ({ tenantId, args }) => {
        const body = String(args?.body ?? "").trim();
        if (!body) return { result: "A note needs some body text." };
        const vals = {
            title: args?.title ? String(args.title).slice(0, 200) : null,
            body,
            tags: args?.tags ? String(args.tags).slice(0, 200) : null,
            pinned: args?.pinned === true,
            updatedAt: new Date(),
        };
        if (args?.id) {
            const res = await db.update(notes).set(vals)
                .where(and(eq(notes.tenantId, tenantId), eq(notes.id, String(args.id)))).returning({ id: notes.id });
            if (!res[0]) return { result: `No note found with id ${args.id}.` };
            return { result: `Note updated (id: ${res[0].id}).` };
        }
        const res = await db.insert(notes).values({ tenantId, ...vals }).returning({ id: notes.id });
        return { result: `Note saved (id: ${res[0].id}).` };
    },
};

export const noteListTool: Tool = {
    name: "note_list",
    source: "builtin",
    description: "List saved notes, most recent first (pinned notes float to the top).",
    parameters: { type: "object", properties: { limit: { type: "number", description: "Max notes to return (default 20)." } }, required: [] },
    execute: async ({ tenantId, args }) => {
        const limit = Math.min(Math.max(Number(args?.limit) || 20, 1), 100);
        const rows = await db.select().from(notes)
            .where(eq(notes.tenantId, tenantId))
            .orderBy(desc(notes.pinned), desc(notes.updatedAt))
            .limit(limit);
        if (rows.length === 0) return { result: "The notepad is empty." };
        return { result: `Notes (${rows.length}):\n${rows.map(previewLine).join("\n")}` };
    },
};

export const noteSearchTool: Tool = {
    name: "note_search",
    source: "builtin",
    description: "Search notes by keyword in the title or body.",
    parameters: { type: "object", properties: { query: { type: "string", description: "Text to search for." } }, required: ["query"] },
    execute: async ({ tenantId, args }) => {
        const q = String(args?.query ?? "").trim();
        if (!q) return { result: "Provide a search query." };
        const like = `%${q}%`;
        const rows = await db.select().from(notes)
            .where(and(eq(notes.tenantId, tenantId), or(ilike(notes.title, like), ilike(notes.body, like))))
            .orderBy(desc(notes.updatedAt)).limit(30);
        if (rows.length === 0) return { result: `No notes matching "${q}".` };
        return { result: `Notes matching "${q}" (${rows.length}):\n${rows.map(previewLine).join("\n")}` };
    },
};

export const noteDeleteTool: Tool = {
    name: "note_delete",
    source: "builtin",
    description: "Delete a note by its id (from note_list / note_search).",
    parameters: { type: "object", properties: { id: { type: "string", description: "The note id." } }, required: ["id"] },
    execute: async ({ tenantId, args }) => {
        const id = String(args?.id ?? "").trim();
        if (!id) return { result: "Provide the note id." };
        const res = await db.delete(notes)
            .where(and(eq(notes.tenantId, tenantId), eq(notes.id, id))).returning({ id: notes.id });
        return { result: res[0] ? `Note ${id} deleted.` : `No note found with id ${id}.` };
    },
};
