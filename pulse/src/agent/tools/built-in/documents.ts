/**
 * Document locker tools — let the agent find and READ files the owner uploaded
 * (contracts, quotes, tenders, receipts) plus files it generated (filled PDFs).
 * The agent only ever sees text + metadata, never the raw bytes/base64.
 * Uploading happens in the dashboard (Documents page).
 */

import { Tool } from "../tool.interface.js";
import { db } from "../../../storage/db.js";
import { documents } from "../../../storage/schema.js";
import { and, eq, desc, ilike, or } from "drizzle-orm";
import { extractPdfText } from "../pdf-util.js";

const READ_LIMIT = 8000;

const line = (r: { id: string; filename: string; title: string | null; mimeType: string | null; source: string | null }) =>
    `- ${(r.title && r.title.trim()) || r.filename}${r.title ? ` (${r.filename})` : ""}${r.source && r.source !== "upload" ? ` [${r.source}]` : ""} — ${r.mimeType || "file"} [id: ${r.id}]`;

export const documentListTool: Tool = {
    name: "document_list",
    source: "builtin",
    description: "List files in the document locker (contracts, quotes, receipts, generated PDFs).",
    parameters: { type: "object", properties: { limit: { type: "number", description: "Max files (default 30)." } }, required: [] },
    execute: async ({ tenantId, args }) => {
        const limit = Math.min(Math.max(Number(args?.limit) || 30, 1), 100);
        const rows = await db.select({ id: documents.id, filename: documents.filename, title: documents.title, mimeType: documents.mimeType, source: documents.source })
            .from(documents).where(eq(documents.tenantId, tenantId)).orderBy(desc(documents.updatedAt)).limit(limit);
        if (rows.length === 0) return { result: "The document locker is empty. Files can be uploaded in Dashboard → Documents." };
        return { result: `Documents (${rows.length}):\n${rows.map(line).join("\n")}` };
    },
};

export const documentSearchTool: Tool = {
    name: "document_search",
    source: "builtin",
    description: "Search documents by keyword in the filename, title, notes, tags, or the document's text content.",
    parameters: { type: "object", properties: { query: { type: "string", description: "Text to search for." } }, required: ["query"] },
    execute: async ({ tenantId, args }) => {
        const q = String(args?.query ?? "").trim();
        if (!q) return { result: "Provide a search query." };
        const like = `%${q}%`;
        const rows = await db.select({ id: documents.id, filename: documents.filename, title: documents.title, mimeType: documents.mimeType, source: documents.source })
            .from(documents)
            .where(and(eq(documents.tenantId, tenantId),
                or(ilike(documents.filename, like), ilike(documents.title, like), ilike(documents.notes, like), ilike(documents.tags, like), ilike(documents.extractedText, like))))
            .orderBy(desc(documents.updatedAt)).limit(30);
        if (rows.length === 0) return { result: `No documents matching "${q}".` };
        return { result: `Documents matching "${q}" (${rows.length}):\n${rows.map(line).join("\n")}` };
    },
};

export const documentReadTool: Tool = {
    name: "document_read",
    source: "builtin",
    description: "Read the text content of a document by its id (from document_list/search). Returns extracted text (PDFs and text files).",
    parameters: { type: "object", properties: { id: { type: "string", description: "The document id." } }, required: ["id"] },
    execute: async ({ tenantId, args }) => {
        const id = String(args?.id ?? "").trim();
        if (!id) return { result: "Provide the document id." };
        const rows = await db.select().from(documents).where(and(eq(documents.tenantId, tenantId), eq(documents.id, id))).limit(1);
        const doc = rows[0];
        if (!doc) return { result: `No document found with id ${id}.` };
        let text = doc.extractedText ?? "";
        // Fall back to extracting on the fly for PDFs that weren't indexed at
        // upload (the dashboard doesn't extract PDFs), and cache the result so
        // document_search can find the content next time.
        if (!text && doc.content && (doc.mimeType?.includes("pdf") || doc.filename.toLowerCase().endsWith(".pdf"))) {
            text = await extractPdfText(Buffer.from(doc.content, "base64"));
            if (text) {
                await db.update(documents).set({ extractedText: text }).where(and(eq(documents.tenantId, tenantId), eq(documents.id, id)));
            }
        }
        if (!text) return { result: `"${doc.filename}" has no extractable text (it may be a scanned image or unsupported type).` };
        const truncated = text.length > READ_LIMIT;
        return { result: `${doc.title || doc.filename}:\n\n${text.slice(0, READ_LIMIT)}${truncated ? `\n\n…(truncated, ${text.length} chars total)` : ""}` };
    },
};

export const documentDeleteTool: Tool = {
    name: "document_delete",
    source: "builtin",
    description: "Delete a document by its id.",
    parameters: { type: "object", properties: { id: { type: "string", description: "The document id." } }, required: ["id"] },
    execute: async ({ tenantId, args }) => {
        const id = String(args?.id ?? "").trim();
        if (!id) return { result: "Provide the document id." };
        const res = await db.delete(documents).where(and(eq(documents.tenantId, tenantId), eq(documents.id, id))).returning({ id: documents.id });
        return { result: res[0] ? `Document ${id} deleted.` : `No document found with id ${id}.` };
    },
};
