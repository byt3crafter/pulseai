/**
 * Shared file-intake helpers for the document locker — used by the Documents
 * page (plain uploads) and the Expenses receipt-attach flow. Not a server
 * action module (no "use server"): plain functions can't be exported from a
 * "use server" file, only async actions can.
 *
 * IMPORTANT: PDF text extraction is deliberately NOT done here. pdf-parse
 * (pdfjs-dist) touches browser globals and crashes the Next server runtime.
 * The gateway (plain Node) extracts PDF text on first read and caches it back
 * to the row, so search still works — see the document/pdf agent tools.
 */

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB

const TEXT_EXTENSIONS = [".txt", ".md", ".csv", ".json"];

/**
 * Best-effort text extraction for plain-text uploads only. PDFs return null
 * here and are indexed later by the gateway. Never throws.
 */
export async function extractDocumentText(buf: Buffer, mimeType: string, filename: string): Promise<string | null> {
    const lowerName = filename.toLowerCase();
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
