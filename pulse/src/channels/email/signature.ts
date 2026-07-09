/**
 * Email Signature — pure helpers for building & rendering per-agent (or
 * company-default) HTML email signatures.
 *
 * Storage shape (persisted at `agentProfiles.emailConfig.signature` and, for
 * the company default, `channelConnections.channelConfig.signature`):
 *
 *   {
 *     enabled: boolean,
 *     mode: "builder" | "raw",
 *     html: string,               // raw-mode source, ignored in builder mode
 *     fields?: { name, title, company, phone, website, tagline },
 *     logo?: { dataBase64, mime },
 *   }
 *
 * `buildSignatureHtml` renders a table-based, inline-styled fragment safe for
 * Gmail/Outlook (no flexbox/grid, no external CSS, no <style> blocks) with
 * `{{variable}}` placeholders wrapped in `<!--var:name-->…<!--/var:name-->`
 * markers so `renderSignature` can drop a row entirely when its value is
 * empty, instead of leaving a dangling "Phone: " line.
 *
 * `renderSignature` resolves builder vs. raw mode, substitutes variables from
 * `fields` + the caller's `fromAddress` (for {{email}}), strips now-empty
 * rows, and derives a plain-text fallback by stripping tags — used for the
 * multipart `text` part so it isn't naked.
 */

export interface SignatureFields {
    name?: string;
    title?: string;
    company?: string;
    phone?: string;
    website?: string;
    tagline?: string;
}

export interface SignatureLogo {
    /** Base64-encoded image bytes (no data: URI prefix). */
    dataBase64: string;
    /** MIME type, e.g. "image/png" or "image/jpeg". */
    mime: string;
}

export interface SignatureConfig {
    enabled: boolean;
    mode: "builder" | "raw";
    /** Raw-mode HTML source. Ignored (but preserved) in builder mode. */
    html: string;
    fields?: SignatureFields;
    logo?: SignatureLogo;
}

export interface RenderContext {
    /** The sending mailbox's address, substituted for {{email}}. */
    fromAddress?: string;
}

export interface RenderedSignature {
    html: string;
    text: string;
}

const VARIABLE_NAMES = ["name", "title", "company", "email", "phone", "website", "tagline"] as const;
type VariableName = (typeof VARIABLE_NAMES)[number];

const ACCENT = "#4f46e5"; // indigo — matches Pulse's accent color

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/** MIME → file extension, used for the CID attachment filename. */
export function extensionForMime(mime: string | undefined): string {
    switch ((mime || "").toLowerCase()) {
        case "image/png":
            return "png";
        case "image/jpeg":
        case "image/jpg":
            return "jpg";
        case "image/gif":
            return "gif";
        case "image/webp":
            return "webp";
        case "image/svg+xml":
            return "svg";
        default:
            return "png";
    }
}

/**
 * Build the builder-mode signature markup. Table-based + inline-styled only
 * (no flexbox/grid/<style>) so it survives Gmail/Outlook's stripped-down CSS
 * support. Each field row is wrapped in `<!--var:x-->…<!--/var:x-->` markers
 * so `renderSignature` can remove the row entirely when the field is blank,
 * rather than rendering an empty "Label: " line.
 */
export function buildSignatureHtml(fields: SignatureFields = {}, hasLogo = false): string {
    const font = "font-family:Arial,Helvetica,sans-serif;";

    const row = (name: VariableName, content: string, style: string) =>
        `<!--var:${name}--><tr><td style="${style}${font}">${content}</td></tr><!--/var:${name}-->`;

    const nameRow = row(
        "name",
        "{{name}}",
        "padding:0 0 2px 0;font-size:14px;font-weight:bold;line-height:20px;color:#111111;"
    );
    const titleRow = row("title", "{{title}}", "padding:0;font-size:12px;line-height:18px;color:#444444;");
    const companyRow = row("company", "{{company}}", "padding:0 0 8px 0;font-size:12px;line-height:18px;color:#444444;");
    const phoneRow = row(
        "phone",
        `<span style="color:#888888;">Phone:</span> {{phone}}`,
        "padding:1px 0;font-size:12px;line-height:18px;color:#555555;"
    );
    const websiteRow = row(
        "website",
        `<a href="{{website}}" style="color:${ACCENT};text-decoration:none;">{{website}}</a>`,
        "padding:1px 0;font-size:12px;line-height:18px;"
    );
    const emailRow = row(
        "email",
        `<a href="mailto:{{email}}" style="color:${ACCENT};text-decoration:none;">{{email}}</a>`,
        "padding:1px 0;font-size:12px;line-height:18px;"
    );
    const taglineRow = row(
        "tagline",
        "{{tagline}}",
        "padding:8px 0 0 0;font-size:11px;font-style:italic;line-height:16px;color:#888888;"
    );

    const logoCell = hasLogo
        ? `<td style="padding:0 16px 0 0;vertical-align:top;" valign="top">` +
          `<img src="cid:signature-logo" alt="" width="72" style="display:block;border:0;outline:none;max-width:72px;height:auto;" />` +
          `</td>`
        : "";

    return (
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;${font}">` +
        `<tr>` +
        logoCell +
        `<td style="vertical-align:top;border-left:2px solid ${ACCENT};padding:2px 0 2px 12px;" valign="top">` +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">` +
        nameRow +
        titleRow +
        companyRow +
        phoneRow +
        websiteRow +
        emailRow +
        taglineRow +
        `</table>` +
        `</td>` +
        `</tr>` +
        `</table>`
    );
}

/** Remove `<!--var:x-->…<!--/var:x-->` blocks whose variable resolved empty. */
function stripEmptyVarBlocks(html: string, vars: Record<string, string>): string {
    return html.replace(/<!--var:([a-zA-Z0-9_]+)-->([\s\S]*?)<!--\/var:\1-->/g, (_m, key: string, inner: string) => {
        const val = vars[key.toLowerCase()];
        return val && val.trim().length > 0 ? inner : "";
    });
}

/** Replace {{name}} / {{ name }} tokens (case-insensitive) with their resolved value, HTML-escaped. */
function substituteVariables(html: string, vars: Record<string, string>): string {
    return html.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
        const val = vars[key.toLowerCase()];
        return val ? escapeHtml(val) : "";
    });
}

function collapseBlankLines(html: string): string {
    return html.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Derive a plain-text fallback from rendered signature HTML: strip tags,
 * decode common entities, and drop blank lines left over from removed rows.
 */
export function htmlToText(html: string): string {
    const text = html
        .replace(/<\/(tr|p|div|li|table)>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'");

    return text
        .split("\n")
        .map((line) => line.replace(/[ \t]+/g, " ").trim())
        .filter((line) => line.length > 0)
        .join("\n");
}

/**
 * Resolve a signature to its final {html, text}: builder mode regenerates
 * the table from `fields`, raw mode uses `sig.html` as-is. Both then get
 * `{{variable}}` substitution (fields + ctx.fromAddress for {{email}}) and
 * empty-row cleanup. Never throws — callers should still wrap this in a
 * try/catch since a malformed raw HTML template is still possible to break
 * downstream mail rendering in unexpected ways.
 */
export function renderSignature(sig: SignatureConfig, ctx: RenderContext = {}): RenderedSignature {
    const fields = sig.fields || {};
    const hasLogo = !!sig.logo?.dataBase64;

    let html = sig.mode === "raw" ? sig.html || "" : buildSignatureHtml(fields, hasLogo);

    const vars: Record<string, string> = {
        name: fields.name || "",
        title: fields.title || "",
        company: fields.company || "",
        email: ctx.fromAddress || "",
        phone: fields.phone || "",
        website: fields.website || "",
        tagline: fields.tagline || "",
    };

    html = stripEmptyVarBlocks(html, vars);
    html = substituteVariables(html, vars);
    html = collapseBlankLines(html);

    return { html, text: htmlToText(html) };
}
