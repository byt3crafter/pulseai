/**
 * PDF helpers shared by the document + pdf tools.
 * - extractPdfText: pull the text layer out of a PDF (pdf-parse).
 * - listPdfFields / fillPdfForm: read and fill AcroForm (fillable) fields (pdf-lib).
 *
 * NOTE: raw file bytes / base64 must NEVER be returned to the model — only text,
 * field names, and metadata. Callers enforce that.
 */

import { PDFDocument } from "pdf-lib";
import { PDFParse } from "pdf-parse";

export interface PdfField {
    name: string;
    type: string; // text | checkbox | dropdown | radio | button | signature | other
    options?: string[];
}

const TYPE_MAP: Record<string, string> = {
    PDFTextField: "text",
    PDFCheckBox: "checkbox",
    PDFDropdown: "dropdown",
    PDFOptionList: "dropdown",
    PDFRadioGroup: "radio",
    PDFButton: "button",
    PDFSignature: "signature",
};

/** Extract the text layer of a PDF. Returns "" if it has no extractable text. */
export async function extractPdfText(buffer: Buffer): Promise<string> {
    try {
        const parser = new PDFParse({ data: buffer });
        const res = await parser.getText();
        return (res?.text ?? "").replace(/\n{3,}/g, "\n\n").trim();
    } catch {
        return "";
    }
}

/** List the fillable form fields of a PDF (name + type + options where relevant). */
export async function listPdfFields(buffer: Buffer): Promise<PdfField[]> {
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const form = doc.getForm();
    return form.getFields().map((f) => {
        const type = TYPE_MAP[f.constructor.name] ?? "other";
        const field: PdfField = { name: f.getName(), type };
        const anyF = f as any;
        if (typeof anyF.getOptions === "function") {
            try { field.options = anyF.getOptions(); } catch { /* ignore */ }
        }
        return field;
    });
}

export interface FillResult {
    bytes: Uint8Array;
    filled: string[];
    skipped: { name: string; reason: string }[];
}

/**
 * Fill a PDF's form fields from a {fieldName: value} map. Text fields take the
 * string value; checkboxes check on a truthy value ("true"/"yes"/"1"/true);
 * dropdowns/radios select the value if it's a valid option. Unknown fields are
 * skipped (reported), never fatal.
 */
export async function fillPdfForm(buffer: Buffer, values: Record<string, unknown>): Promise<FillResult> {
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const form = doc.getForm();
    const byName = new Map(form.getFields().map((f) => [f.getName(), f]));
    const filled: string[] = [];
    const skipped: { name: string; reason: string }[] = [];
    const truthy = (v: unknown) => v === true || ["true", "yes", "1", "on", "x", "checked"].includes(String(v).trim().toLowerCase());

    for (const [name, value] of Object.entries(values)) {
        const f = byName.get(name);
        if (!f) { skipped.push({ name, reason: "no such field" }); continue; }
        const type = TYPE_MAP[f.constructor.name] ?? "other";
        try {
            if (type === "text") (form.getTextField(name)).setText(String(value ?? ""));
            else if (type === "checkbox") { const cb = form.getCheckBox(name); truthy(value) ? cb.check() : cb.uncheck(); }
            else if (type === "dropdown") (form.getDropdown(name)).select(String(value));
            else if (type === "radio") (form.getRadioGroup(name)).select(String(value));
            else { skipped.push({ name, reason: `unsupported field type ${type}` }); continue; }
            filled.push(name);
        } catch (err: any) {
            skipped.push({ name, reason: err?.message || "could not set value" });
        }
    }
    const bytes = await doc.save();
    return { bytes, filled, skipped };
}
