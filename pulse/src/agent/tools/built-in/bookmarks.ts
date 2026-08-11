/**
 * Bookmark tools — saved links (web pages + YouTube videos). The `kind` is
 * auto-detected from the URL, so YouTube links are tagged as videos automatically.
 */

import { Tool } from "../tool.interface.js";
import { db } from "../../../storage/db.js";
import { bookmarks } from "../../../storage/schema.js";
import { and, eq, desc, ilike, or } from "drizzle-orm";

function detectKind(url: string): "web" | "youtube" {
    // Match youtube.com / youtu.be in HOST position: right after "//" or a
    // subdomain dot, and ending at a path/port/query boundary. Avoids
    // false-matching hosts like "notyoutube.com".
    return /(?:\/\/|\.)(?:youtube\.com|youtu\.be)(?:[/:?#]|$)/i.test(url) ? "youtube" : "web";
}

const line = (r: { id: string; url: string; title: string | null; kind: string | null }) =>
    `- ${r.kind === "youtube" ? "▶ " : "🔖 "}${(r.title && r.title.trim()) || r.url} — ${r.url} [id: ${r.id}]`;

export const bookmarkSaveTool: Tool = {
    name: "bookmark_save",
    source: "builtin",
    description: "Save a bookmark (web page or YouTube video). YouTube links are auto-tagged as videos. Pass an id to update an existing bookmark.",
    parameters: {
        type: "object",
        properties: {
            url: { type: "string", description: "The URL to bookmark." },
            title: { type: "string", description: "Optional title/label." },
            notes: { type: "string", description: "Optional notes about why it's saved." },
            tags: { type: "string", description: "Optional comma-separated tags." },
            id: { type: "string", description: "Id of an existing bookmark to update (omit to create)." },
        },
        required: ["url"],
    },
    execute: async ({ tenantId, args }) => {
        const url = String(args?.url ?? "").trim();
        if (!url) return { result: "A bookmark needs a URL." };
        const vals = {
            url: url.slice(0, 2000),
            title: args?.title ? String(args.title).slice(0, 300) : null,
            notes: args?.notes ? String(args.notes).slice(0, 1000) : null,
            tags: args?.tags ? String(args.tags).slice(0, 200) : null,
            kind: detectKind(url),
            updatedAt: new Date(),
        };
        if (args?.id) {
            const res = await db.update(bookmarks).set(vals)
                .where(and(eq(bookmarks.tenantId, tenantId), eq(bookmarks.id, String(args.id)))).returning({ id: bookmarks.id });
            if (!res[0]) return { result: `No bookmark found with id ${args.id}.` };
            return { result: `Bookmark updated (id: ${res[0].id}).` };
        }
        const res = await db.insert(bookmarks).values({ tenantId, ...vals }).returning({ id: bookmarks.id });
        return { result: `Bookmark saved${vals.kind === "youtube" ? " (YouTube)" : ""} (id: ${res[0].id}).` };
    },
};

export const bookmarkListTool: Tool = {
    name: "bookmark_list",
    source: "builtin",
    description: "List saved bookmarks. Optionally filter by kind ('web' or 'youtube').",
    parameters: {
        type: "object",
        properties: {
            kind: { type: "string", enum: ["web", "youtube"], description: "Only show this kind." },
            limit: { type: "number", description: "Max bookmarks (default 30)." },
        },
        required: [],
    },
    execute: async ({ tenantId, args }) => {
        const limit = Math.min(Math.max(Number(args?.limit) || 30, 1), 100);
        const kind = args?.kind === "web" || args?.kind === "youtube" ? String(args.kind) : null;
        const where = kind
            ? and(eq(bookmarks.tenantId, tenantId), eq(bookmarks.kind, kind))
            : eq(bookmarks.tenantId, tenantId);
        const rows = await db.select().from(bookmarks).where(where).orderBy(desc(bookmarks.updatedAt)).limit(limit);
        if (rows.length === 0) return { result: kind ? `No ${kind} bookmarks saved.` : "No bookmarks saved." };
        return { result: `Bookmarks (${rows.length}):\n${rows.map(line).join("\n")}` };
    },
};

export const bookmarkSearchTool: Tool = {
    name: "bookmark_search",
    source: "builtin",
    description: "Search bookmarks by keyword in the title, URL, notes or tags.",
    parameters: { type: "object", properties: { query: { type: "string", description: "Text to search for." } }, required: ["query"] },
    execute: async ({ tenantId, args }) => {
        const q = String(args?.query ?? "").trim();
        if (!q) return { result: "Provide a search query." };
        const like = `%${q}%`;
        const rows = await db.select().from(bookmarks)
            .where(and(eq(bookmarks.tenantId, tenantId),
                or(ilike(bookmarks.title, like), ilike(bookmarks.url, like), ilike(bookmarks.notes, like), ilike(bookmarks.tags, like))))
            .orderBy(desc(bookmarks.updatedAt)).limit(30);
        if (rows.length === 0) return { result: `No bookmarks matching "${q}".` };
        return { result: `Bookmarks matching "${q}" (${rows.length}):\n${rows.map(line).join("\n")}` };
    },
};

export const bookmarkDeleteTool: Tool = {
    name: "bookmark_delete",
    source: "builtin",
    description: "Delete a bookmark by its id.",
    parameters: { type: "object", properties: { id: { type: "string", description: "The bookmark id." } }, required: ["id"] },
    execute: async ({ tenantId, args }) => {
        const id = String(args?.id ?? "").trim();
        if (!id) return { result: "Provide the bookmark id." };
        const res = await db.delete(bookmarks)
            .where(and(eq(bookmarks.tenantId, tenantId), eq(bookmarks.id, id))).returning({ id: bookmarks.id });
        return { result: res[0] ? `Bookmark ${id} deleted.` : `No bookmark found with id ${id}.` };
    },
};
