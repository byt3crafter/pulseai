/**
 * Turn browser-chat file attachments into something an agent can use:
 *  - images  → temp-file ProviderAttachments (vision, for models that support it)
 *  - PDF / Word / Excel / CSV / text / code → extracted text, injected as context
 *  - anything else → a short note so the agent knows a file was attached
 *
 * Extraction runs in the gateway (not Next.js) because the PDF parser crashes the
 * Next runtime, and to keep behaviour identical across channels. Raw file bytes are
 * NEVER handed to the model except images (as vision) — everything else becomes text.
 */
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import { extractPdfText } from "../agent/tools/pdf-util.js";
import { logger } from "../utils/logger.js";
import type { ProviderAttachment } from "../agent/providers/anthropic.js";

/** One file as it arrives from the browser (base64 to dodge multipart-through-proxy issues). */
export interface IncomingAttachment { name: string; mime: string; dataBase64: string }

export interface ProcessedAttachments {
    images: ProviderAttachment[]; // vision attachments written to temp files
    contextText: string;          // extracted text to prepend to the user's message
}

const MAX_FILES = 10;
const MAX_TEXT_CHARS = 120_000;    // per-file cap so a huge sheet can't blow the context window
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file

function sanitize(name: string): string {
    return (name || "file").replace(/[^\w.\-]+/g, "_").slice(0, 80);
}

function truncate(text: string): string {
    const t = (text || "").trim();
    return t.length > MAX_TEXT_CHARS ? t.slice(0, MAX_TEXT_CHARS) + "\n…[truncated]" : t;
}

function fileBlock(name: string, kind: string, body: string): string {
    const b = truncate(body);
    return b ? `[Attached ${kind} "${name}"]:\n${b}` : `[Attached ${kind} "${name}" — empty or no extractable text]`;
}

function ext(name: string): string {
    const m = /\.([a-z0-9]+)$/i.exec(name || "");
    return m ? m[1].toLowerCase() : "";
}

/** Excel/CSV → each sheet rendered as CSV text. */
function extractSpreadsheet(buf: Buffer): string {
    const wb = XLSX.read(buf, { type: "buffer" });
    const out: string[] = [];
    for (const sheetName of wb.SheetNames) {
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
        if (csv.trim()) out.push(wb.SheetNames.length > 1 ? `# Sheet: ${sheetName}\n${csv}` : csv);
    }
    return out.join("\n\n");
}

const TEXT_EXTS = new Set(["txt", "md", "markdown", "json", "csv", "tsv", "log", "xml", "yaml", "yml", "html", "htm", "js", "ts", "tsx", "jsx", "py", "rb", "go", "rs", "java", "c", "cpp", "h", "sh", "sql", "css", "ini", "toml", "env"]);

export async function processAttachments(atts: IncomingAttachment[]): Promise<ProcessedAttachments> {
    const images: ProviderAttachment[] = [];
    const parts: string[] = [];

    for (const a of (atts || []).slice(0, MAX_FILES)) {
        const name = a?.name || "file";
        try {
            const buf = Buffer.from(a.dataBase64 || "", "base64");
            if (buf.length === 0) continue;
            if (buf.length > MAX_BYTES) { parts.push(`[Attached "${name}" skipped — over 25 MB]`); continue; }
            const mime = (a.mime || "").toLowerCase();
            const e = ext(name);

            if (mime.startsWith("image/")) {
                const p = join(tmpdir(), `pulse-att-${randomUUID()}-${sanitize(name)}`);
                await writeFile(p, buf);
                images.push({ type: "image", path: p, mime: mime || "image/png" });
                parts.push(`[Image attached: ${name}]`);
            } else if (mime === "application/pdf" || e === "pdf") {
                parts.push(fileBlock(name, "PDF", await extractPdfText(buf)));
            } else if (e === "xlsx" || e === "xls" || e === "csv" || e === "tsv" || mime.includes("spreadsheet") || mime.includes("excel") || mime === "text/csv") {
                parts.push(fileBlock(name, "spreadsheet", extractSpreadsheet(buf)));
            } else if (e === "docx" || e === "doc" || mime.includes("wordprocessing") || mime === "application/msword") {
                const { value } = await mammoth.extractRawText({ buffer: buf });
                parts.push(fileBlock(name, "document", value));
            } else if (mime.startsWith("text/") || mime === "application/json" || TEXT_EXTS.has(e)) {
                parts.push(fileBlock(name, "file", buf.toString("utf8")));
            } else {
                parts.push(`[Attached file "${name}" (${mime || "unknown type"}, ${(buf.length / 1024).toFixed(0)} KB) — binary content not extractable as text]`);
            }
        } catch (err) {
            logger.warn({ err, name }, "Attachment extraction failed");
            parts.push(`[Attached file "${name}" — could not be read]`);
        }
    }

    return { images, contextText: parts.join("\n\n") };
}
