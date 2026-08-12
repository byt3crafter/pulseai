"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "../../../storage/db";
import { documents } from "../../../storage/schema";
import { requireTenant } from "../../../utils/tenant-auth";
import { logAudit } from "../../../utils/audit";
import { extractDocumentText, MAX_DOCUMENT_BYTES } from "./document-file";

export interface DocumentRow {
    id: string;
    filename: string;
    mimeType: string | null;
    sizeBytes: number | null;
    title: string | null;
    tags: string | null;
    source: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
}

/**
 * List the tenant's documents, most recently uploaded first. Metadata only —
 * `content` (base64 of the raw bytes) is never selected here, it's large and
 * only needed for download. Returns [] on auth failure.
 */
export async function getDocuments(): Promise<DocumentRow[]> {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return [];
    const tenantId = tenantCheck.tenantId;

    try {
        const rows = await db.select({
            id: documents.id,
            filename: documents.filename,
            mimeType: documents.mimeType,
            sizeBytes: documents.sizeBytes,
            title: documents.title,
            tags: documents.tags,
            source: documents.source,
            createdAt: documents.createdAt,
            updatedAt: documents.updatedAt,
        })
            .from(documents)
            .where(eq(documents.tenantId, tenantId))
            .orderBy(desc(documents.createdAt));
        return rows;
    } catch (error) {
        console.error("Failed to load documents:", error);
        return [];
    }
}

/** Upload a file into the document locker. Extracts searchable text (PDF/text) best-effort. */
export async function uploadDocumentAction(formData: FormData) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    const file = formData.get("file") as File | null;
    if (!file || typeof file === "string" || !file.size) {
        return { success: false, message: "Please choose a file to upload." };
    }

    const title = ((formData.get("title") as string) || "").trim();
    const tags = ((formData.get("tags") as string) || "").trim();

    try {
        const buf = Buffer.from(await file.arrayBuffer());
        if (buf.length > MAX_DOCUMENT_BYTES) {
            return { success: false, message: "File is too large. The limit is 10 MB." };
        }

        const mimeType = file.type || "application/octet-stream";
        const filename = file.name || "untitled";
        const extractedText = await extractDocumentText(buf, mimeType, filename);

        await db.insert(documents).values({
            tenantId,
            filename,
            mimeType,
            sizeBytes: buf.length,
            content: buf.toString("base64"),
            extractedText,
            title: title || null,
            tags: tags || null,
            source: "upload",
        });

        await logAudit({
            action: "document.upload",
            targetType: "document",
            targetId: title || filename,
            tenantId,
            summary: `Uploaded document: ${filename}`,
        });

        revalidatePath("/dashboard/documents");
        return { success: true, message: "Document uploaded." };
    } catch (error) {
        console.error("Failed to upload document:", error);
        return { success: false, message: "Failed to upload document." };
    }
}

/** Delete a document by id, scoped to the tenant. */
export async function deleteDocumentAction(id: string) {
    const tenantCheck = await requireTenant();
    if (!tenantCheck.authorized) return { success: false, message: tenantCheck.message };
    const tenantId = tenantCheck.tenantId;

    if (!id) return { success: false, message: "Document id is required." };

    try {
        const [existing] = await db.select({ filename: documents.filename })
            .from(documents)
            .where(and(eq(documents.id, id), eq(documents.tenantId, tenantId)))
            .limit(1);

        await db.delete(documents).where(and(eq(documents.id, id), eq(documents.tenantId, tenantId)));

        await logAudit({
            action: "document.delete",
            targetType: "document",
            targetId: id,
            tenantId,
            summary: `Deleted document${existing?.filename ? `: ${existing.filename}` : ""}`,
        });

        revalidatePath("/dashboard/documents");
        return { success: true, message: "Document deleted." };
    } catch (error) {
        console.error("Failed to delete document:", error);
        return { success: false, message: "Failed to delete document." };
    }
}
