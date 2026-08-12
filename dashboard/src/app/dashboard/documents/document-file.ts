import { PDFParse } from "pdf-parse";

/**
 * Shared file-intake helpers for the document locker — used by the Documents
 * page (plain uploads) and the Expenses receipt-attach flow. Not a server
 * action module (no "use server"): plain functions can't be exported from a
 * "use server" file, only async actions can.
 */

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB

const TEXT_EXTENSIONS = [".txt", ".md", ".csv", ".json"];

/**
 * Best-effort text extraction for search/read. Never throws — a failure here
 * must not fail the upload, so extractedText just comes back null.
 */
export async function extractDocumentText(buf: Buffer, mimeType: string, filename: string): Promise<string | null> {
    const lowerName = filename.toLowerCase();
    const isPdf = mimeType.includes("pdf") || lowerName.endsWith(".pdf");

    if (isPdf) {
        try {
            const parser = new PDFParse({ data: buf });
            const res = await parser.getText();
            const text = (res?.text ?? "").trim();
            return text || null;
        } catch (error) {
            console.error("Failed to extract PDF text:", error);
            return null;
        }
    }

    const isPlainText = mimeType.startsWith("text/") || TEXT_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    if (isPlainText) {
        try {
            return buf.toString("utf8").slice(0, 200000);
        } catch (error) {
            console.error("Failed to decode text file:", error);
            return null;
        }
    }

    return null;
}
