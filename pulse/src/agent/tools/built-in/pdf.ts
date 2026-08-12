/**
 * PDF tools — read a PDF's text, inspect a fillable form's fields, and fill it.
 * Operates on documents in the locker (by id). Filled PDFs are saved back to the
 * locker as a new 'generated' document the owner can download from the dashboard.
 */

import { Tool } from "../tool.interface.js";
import { db } from "../../../storage/db.js";
import { documents } from "../../../storage/schema.js";
import { and, eq } from "drizzle-orm";
import { extractPdfText, listPdfFields, fillPdfForm } from "../pdf-util.js";

type LoadResult =
    | { ok: false; error: string }
    | { ok: true; doc: typeof documents.$inferSelect; buffer: Buffer };

async function loadPdf(tenantId: string, id: string): Promise<LoadResult> {
    if (!id) return { ok: false, error: "Provide the document id." };
    const rows = await db.select().from(documents).where(and(eq(documents.tenantId, tenantId), eq(documents.id, id))).limit(1);
    const doc = rows[0];
    if (!doc) return { ok: false, error: `No document found with id ${id}.` };
    if (!doc.content) return { ok: false, error: `Document ${id} has no stored content.` };
    const isPdf = doc.mimeType?.includes("pdf") || doc.filename.toLowerCase().endsWith(".pdf");
    if (!isPdf) return { ok: false, error: `"${doc.filename}" is not a PDF.` };
    return { ok: true, doc, buffer: Buffer.from(doc.content, "base64") };
}

export const pdfReadTool: Tool = {
    name: "pdf_read",
    source: "builtin",
    description: "Read the text of a PDF document in the locker (by id). Use document_list/search to find the id.",
    parameters: { type: "object", properties: { document_id: { type: "string", description: "The PDF document's id." } }, required: ["document_id"] },
    execute: async ({ tenantId, args }) => {
        const loaded = await loadPdf(tenantId, String(args?.document_id ?? "").trim());
        if (!loaded.ok) return { result: loaded.error };
        const text = await extractPdfText(loaded.buffer);
        if (!text) return { result: `"${loaded.doc.filename}" has no extractable text (likely a scanned image — OCR isn't available yet).` };
        // Cache extracted text so document_search finds this PDF's content later.
        if (!loaded.doc.extractedText) {
            await db.update(documents).set({ extractedText: text }).where(and(eq(documents.tenantId, tenantId), eq(documents.id, loaded.doc.id)));
        }
        const truncated = text.length > 8000;
        return { result: `${loaded.doc.filename}:\n\n${text.slice(0, 8000)}${truncated ? `\n\n…(truncated, ${text.length} chars)` : ""}` };
    },
};

export const pdfFormFieldsTool: Tool = {
    name: "pdf_form_fields",
    source: "builtin",
    description: "List the fillable form fields of a PDF (name + type + options), so you know what pdf_fill_form expects. Use before filling a form.",
    parameters: { type: "object", properties: { document_id: { type: "string", description: "The PDF document's id." } }, required: ["document_id"] },
    execute: async ({ tenantId, args }) => {
        const loaded = await loadPdf(tenantId, String(args?.document_id ?? "").trim());
        if (!loaded.ok) return { result: loaded.error };
        let fields;
        try { fields = await listPdfFields(loaded.buffer); }
        catch (err: any) { return { result: `Could not read the form: ${err?.message || "unknown error"}` }; }
        if (fields.length === 0) return { result: `"${loaded.doc.filename}" has no fillable form fields (it's a flat/scanned PDF — coordinate overlay isn't available yet).` };
        const lines = fields.map((f) => `- ${f.name} (${f.type})${f.options?.length ? ` options: ${f.options.join(", ")}` : ""}`);
        return { result: `Fillable fields in "${loaded.doc.filename}" (${fields.length}):\n${lines.join("\n")}\n\nCall pdf_fill_form with a values map of {field name: value}.` };
    },
};

export const pdfFillFormTool: Tool = {
    name: "pdf_fill_form",
    source: "builtin",
    description:
        "Fill a fillable PDF form's fields and save the completed PDF back to the locker. Provide the document id and a `values` object mapping field names (from pdf_form_fields) to values. Checkboxes take true/false; text fields take strings.",
    parameters: {
        type: "object",
        properties: {
            document_id: { type: "string", description: "The blank PDF form's document id." },
            values: { type: "object", description: "Map of field name → value, e.g. {\"company.name\": \"Metcheck\", \"agree\": true}." },
            output_name: { type: "string", description: "Optional filename for the filled PDF." },
        },
        required: ["document_id", "values"],
    },
    execute: async ({ tenantId, args }) => {
        const loaded = await loadPdf(tenantId, String(args?.document_id ?? "").trim());
        if (!loaded.ok) return { result: loaded.error };
        const values = args?.values;
        if (!values || typeof values !== "object" || Array.isArray(values)) {
            return { result: "Provide a `values` object mapping field names to values (see pdf_form_fields)." };
        }
        let result;
        try { result = await fillPdfForm(loaded.buffer, values as Record<string, unknown>); }
        catch (err: any) { return { result: `Could not fill the form: ${err?.message || "unknown error"}` }; }
        if (result.filled.length === 0) {
            return { result: `Nothing was filled. ${result.skipped.map((s) => `${s.name}: ${s.reason}`).join("; ") || "No matching fields."} Run pdf_form_fields to see the exact field names.` };
        }
        const base = loaded.doc.filename.replace(/\.pdf$/i, "");
        const outName = (typeof args?.output_name === "string" && args.output_name.trim())
            ? (args.output_name.endsWith(".pdf") ? args.output_name : args.output_name + ".pdf")
            : `${base}-filled.pdf`;
        const b64 = Buffer.from(result.bytes).toString("base64");
        const res = await db.insert(documents).values({
            tenantId,
            filename: outName.slice(0, 300),
            mimeType: "application/pdf",
            sizeBytes: result.bytes.length,
            content: b64,
            title: `Filled: ${loaded.doc.title || base}`,
            source: "generated",
        }).returning({ id: documents.id });
        const skips = result.skipped.length ? ` Skipped: ${result.skipped.map((s) => s.name).join(", ")}.` : "";
        return { result: `Filled ${result.filled.length} field(s) and saved "${outName}" to the locker (download it from Dashboard → Documents).${skips} [id: ${res[0].id}]` };
    },
};
