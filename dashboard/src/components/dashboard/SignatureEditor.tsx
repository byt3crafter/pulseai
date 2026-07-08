"use client";

import { useMemo, useRef, useState } from "react";
import { TrashIcon, ArrowUpTrayIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { Card, CardHeader, Toggle, SettingHint } from "./ui";

/**
 * Shared per-agent / company-default email signature editor. Used by both
 * the agent Email tab (dashboard/app/dashboard/agents/[id]/EmailConfigEditor.tsx)
 * and Settings → Email (dashboard/app/dashboard/settings/SettingsClient.tsx).
 *
 * This is a controlled component — the parent owns the `SignatureValue`
 * state and persists it as part of its own `emailConfig`/`channelConfig`
 * JSON blob on save. Nothing here talks to a server action directly.
 *
 * The preview generator below is a lightweight client-side mirror of the
 * source-of-truth renderer at `pulse/src/channels/email/signature.ts`
 * (table-based, inline-styled, {{variable}} substitution + empty-row
 * cleanup) — good enough for WYSIWYG-ish feedback, not required to be
 * byte-identical since the actual send-time HTML is always generated
 * server-side.
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
    dataBase64: string;
    mime: string;
}

export interface SignatureValue {
    enabled: boolean;
    mode: "builder" | "raw";
    html: string;
    fields?: SignatureFields;
    logo?: SignatureLogo;
}

export const DEFAULT_SIGNATURE: SignatureValue = {
    enabled: false,
    mode: "builder",
    html: "",
    fields: {},
};

const MAX_LOGO_BYTES = 500 * 1024;
const ACCENT = "#4f46e5";

const VARIABLE_HINTS = ["{{name}}", "{{title}}", "{{company}}", "{{email}}", "{{phone}}", "{{website}}", "{{tagline}}"];

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/** Client-side mirror of buildSignatureHtml + renderSignature, for the live preview only. */
function buildPreviewHtml(fields: SignatureFields, hasLogo: boolean, placeholderEmail: string): string {
    const font = "font-family:Arial,Helvetica,sans-serif;";
    const row = (content: string, style: string) => `<tr><td style="${style}${font}">${content}</td></tr>`;

    const rows: string[] = [];
    if (fields.name) rows.push(row(escapeHtml(fields.name), "padding:0 0 2px 0;font-size:14px;font-weight:bold;line-height:20px;color:#111111;"));
    if (fields.title) rows.push(row(escapeHtml(fields.title), "padding:0;font-size:12px;line-height:18px;color:#444444;"));
    if (fields.company) rows.push(row(escapeHtml(fields.company), "padding:0 0 8px 0;font-size:12px;line-height:18px;color:#444444;"));
    if (fields.phone) rows.push(row(`<span style="color:#888888;">Phone:</span> ${escapeHtml(fields.phone)}`, "padding:1px 0;font-size:12px;line-height:18px;color:#555555;"));
    if (fields.website) rows.push(row(`<a href="${escapeHtml(fields.website)}" style="color:${ACCENT};text-decoration:none;">${escapeHtml(fields.website)}</a>`, "padding:1px 0;font-size:12px;line-height:18px;"));
    if (placeholderEmail) rows.push(row(`<a href="mailto:${escapeHtml(placeholderEmail)}" style="color:${ACCENT};text-decoration:none;">${escapeHtml(placeholderEmail)}</a>`, "padding:1px 0;font-size:12px;line-height:18px;"));
    if (fields.tagline) rows.push(row(escapeHtml(fields.tagline), "padding:8px 0 0 0;font-size:11px;font-style:italic;line-height:16px;color:#888888;"));

    if (rows.length === 0 && !hasLogo) return "";

    const logoCell = hasLogo
        ? `<td style="padding:0 16px 0 0;vertical-align:top;" valign="top"><img src="{{logo}}" alt="" width="72" style="display:block;border:0;outline:none;max-width:72px;height:auto;" /></td>`
        : "";

    return (
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;${font}">` +
        `<tr>${logoCell}<td style="vertical-align:top;border-left:2px solid ${ACCENT};padding:2px 0 2px 12px;" valign="top">` +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${rows.join("")}</table>` +
        `</td></tr></table>`
    );
}

function substitutePreviewVariables(html: string, fields: SignatureFields, placeholderEmail: string): string {
    const vars: Record<string, string> = {
        name: fields.name || "",
        title: fields.title || "",
        company: fields.company || "",
        email: placeholderEmail,
        phone: fields.phone || "",
        website: fields.website || "",
        tagline: fields.tagline || "",
    };
    return html.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
        const val = vars[key.toLowerCase()];
        return val ? escapeHtml(val) : "";
    });
}

/** Naive, dependency-free HTML indenter for the raw-mode "Format HTML" button. */
export function formatHtml(html: string): string {
    const voidTags = new Set(["br", "img", "hr", "meta", "link", "input", "area", "base", "col", "embed", "source", "track", "wbr"]);
    const tokens = html
        .trim()
        .replace(/>\s*</g, ">\n<")
        .split("\n")
        .map((t) => t.trim())
        .filter(Boolean);

    let indent = 0;
    const lines: string[] = [];

    for (const token of tokens) {
        const isClosing = /^<\/\w/.test(token);
        const tagName = (token.match(/^<\/?([a-zA-Z0-9]+)/) || [])[1]?.toLowerCase();
        const isSelfClosing = /\/>\s*$/.test(token) || (tagName ? voidTags.has(tagName) : false);
        const isFullPair = /^<([a-zA-Z0-9]+)[^>]*>.*<\/\1>$/.test(token);
        const isOpening = /^<[a-zA-Z]/.test(token) && !isClosing;

        if (isClosing) indent = Math.max(0, indent - 1);
        lines.push("  ".repeat(indent) + token);
        if (isOpening && !isSelfClosing && !isFullPair) indent++;
    }

    return lines.join("\n");
}

export default function SignatureEditor({
    value,
    onChange,
}: {
    value: SignatureValue;
    onChange: (next: SignatureValue) => void;
}) {
    const [logoError, setLogoError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fields = value.fields || {};
    const hasLogo = !!value.logo?.dataBase64;

    function setField(key: keyof SignatureFields, val: string) {
        onChange({ ...value, fields: { ...fields, [key]: val } });
    }

    function handleLogoPick(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;

        setLogoError(null);
        if (!["image/png", "image/jpeg", "image/jpg"].includes(file.type)) {
            setLogoError("Logo must be a PNG or JPG image.");
            return;
        }
        if (file.size > MAX_LOGO_BYTES) {
            setLogoError("Logo must be smaller than 500KB.");
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            const base64 = result.split(",")[1] || "";
            onChange({ ...value, logo: { dataBase64: base64, mime: file.type } });
        };
        reader.onerror = () => setLogoError("Failed to read the selected file.");
        reader.readAsDataURL(file);
    }

    function removeLogo() {
        onChange({ ...value, logo: undefined });
        setLogoError(null);
    }

    function handleFormat() {
        onChange({ ...value, html: formatHtml(value.html || "") });
    }

    const placeholderEmail = "agent@company.com";

    const previewHtml = useMemo(() => {
        if (value.mode === "raw") {
            return substitutePreviewVariables(value.html || "", fields, placeholderEmail);
        }
        const built = buildPreviewHtml(fields, hasLogo, placeholderEmail);
        if (!built) return "";
        // Swap the {{logo}} placeholder for the actual data URL (only relevant to the client preview).
        return hasLogo && value.logo ? built.replace("{{logo}}", `data:${value.logo.mime};base64,${value.logo.dataBase64}`) : built;
    }, [value.mode, value.html, fields, hasLogo, value.logo]);

    const previewDoc = `<!doctype html><html><head><meta charset="utf-8" /></head><body style="margin:0;padding:16px;background:#ffffff;">${
        previewHtml || `<p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#9ca3af;margin:0;">Nothing to preview yet — fill in a field or paste HTML.</p>`
    }</body></html>`;

    return (
        <Card>
            <CardHeader
                title="Email Signature"
                description="Appended automatically to every outgoing email from this agent."
                action={<Toggle checked={value.enabled} onChange={(enabled) => onChange({ ...value, enabled })} label="Enable email signature" />}
            />

            <div className={`p-5 space-y-5 ${value.enabled ? "" : "opacity-50 pointer-events-none"}`}>
                {/* Mode segmented control */}
                <div>
                    <label className="block text-xs font-medium text-pulse-text-soft mb-1.5">Mode</label>
                    <div className="flex rounded-lg border border-pulse-border overflow-hidden w-fit">
                        <button
                            type="button"
                            onClick={() => onChange({ ...value, mode: "builder" })}
                            className={`px-4 py-2 text-sm font-medium transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                                value.mode === "builder" ? "bg-indigo-600 text-white" : "bg-pulse-panel text-pulse-muted hover:bg-pulse-hover"
                            }`}
                        >
                            Builder
                        </button>
                        <button
                            type="button"
                            onClick={() => onChange({ ...value, mode: "raw" })}
                            className={`px-4 py-2 text-sm font-medium transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                                value.mode === "raw" ? "bg-indigo-600 text-white" : "bg-pulse-panel text-pulse-muted hover:bg-pulse-hover"
                            }`}
                        >
                            Raw HTML
                        </button>
                    </div>
                </div>

                {value.mode === "builder" ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-pulse-text-soft mb-1">Full name</label>
                            <input
                                type="text"
                                value={fields.name ?? ""}
                                onChange={(e) => setField("name", e.target.value)}
                                placeholder="Natalie Harrington"
                                className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all motion-reduce:transition-none bg-pulse-panel text-pulse-text placeholder:text-pulse-faint"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-pulse-text-soft mb-1">Title</label>
                            <input
                                type="text"
                                value={fields.title ?? ""}
                                onChange={(e) => setField("title", e.target.value)}
                                placeholder="Chief Financial Officer"
                                className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all motion-reduce:transition-none bg-pulse-panel text-pulse-text placeholder:text-pulse-faint"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-pulse-text-soft mb-1">Company</label>
                            <input
                                type="text"
                                value={fields.company ?? ""}
                                onChange={(e) => setField("company", e.target.value)}
                                placeholder="RunState Ltd."
                                className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all motion-reduce:transition-none bg-pulse-panel text-pulse-text placeholder:text-pulse-faint"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-pulse-text-soft mb-1">Phone</label>
                            <input
                                type="text"
                                value={fields.phone ?? ""}
                                onChange={(e) => setField("phone", e.target.value)}
                                placeholder="+267 71 234 567"
                                className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all motion-reduce:transition-none bg-pulse-panel text-pulse-text placeholder:text-pulse-faint"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-pulse-text-soft mb-1">Website</label>
                            <input
                                type="text"
                                value={fields.website ?? ""}
                                onChange={(e) => setField("website", e.target.value)}
                                placeholder="https://runstate.example"
                                className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all motion-reduce:transition-none bg-pulse-panel text-pulse-text placeholder:text-pulse-faint"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-pulse-text-soft mb-1">Tagline</label>
                            <input
                                type="text"
                                value={fields.tagline ?? ""}
                                onChange={(e) => setField("tagline", e.target.value)}
                                placeholder="Ask me anything, anytime."
                                className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all motion-reduce:transition-none bg-pulse-panel text-pulse-text placeholder:text-pulse-faint"
                            />
                        </div>

                        {/* Logo upload */}
                        <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-pulse-text-soft mb-1">Logo</label>
                            <div className="flex items-center gap-3">
                                {hasLogo && value.logo ? (
                                    <img
                                        src={`data:${value.logo.mime};base64,${value.logo.dataBase64}`}
                                        alt="Signature logo"
                                        className="h-12 w-12 rounded-lg border border-pulse-border-subtle object-contain bg-white p-1"
                                    />
                                ) : (
                                    <div className="h-12 w-12 rounded-lg border border-dashed border-pulse-border flex items-center justify-center text-pulse-faint">
                                        <SparklesIcon className="w-5 h-5" aria-hidden="true" />
                                    </div>
                                )}
                                <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleLogoPick} />
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-pulse-border-subtle rounded-lg hover:bg-pulse-hover transition-colors motion-reduce:transition-none text-pulse-muted cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                >
                                    <ArrowUpTrayIcon className="w-3.5 h-3.5" aria-hidden="true" />
                                    {hasLogo ? "Replace" : "Upload"}
                                </button>
                                {hasLogo && (
                                    <button
                                        type="button"
                                        onClick={removeLogo}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-pulse-border-subtle rounded-lg hover:bg-pulse-hover transition-colors motion-reduce:transition-none text-red-400 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                    >
                                        <TrashIcon className="w-3.5 h-3.5" aria-hidden="true" />
                                        Remove
                                    </button>
                                )}
                            </div>
                            {logoError && <p className="text-xs text-red-400 mt-1.5">{logoError}</p>}
                            <SettingHint>PNG or JPG, up to 500KB. Embedded via CID so it always displays, even with images blocked.</SettingHint>
                        </div>

                        <div className="sm:col-span-2">
                            <SettingHint>
                                Variables like <code className="px-1 py-0.5 rounded bg-pulse-panel-alt text-pulse-text-soft">{"{{name}}"}</code> auto-fill from these fields. {"{{email}}"} is filled from this mailbox&apos;s from-address.
                            </SettingHint>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="block text-xs font-medium text-pulse-text-soft">Signature HTML</label>
                            <button
                                type="button"
                                onClick={handleFormat}
                                className="text-xs font-medium px-2.5 py-1 border border-pulse-border-subtle rounded-lg hover:bg-pulse-hover transition-colors motion-reduce:transition-none text-pulse-muted cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                            >
                                Format HTML
                            </button>
                        </div>
                        <textarea
                            value={value.html}
                            onChange={(e) => onChange({ ...value, html: e.target.value })}
                            rows={10}
                            spellCheck={false}
                            placeholder={`<p>Best regards,<br>{{name}}<br>{{title}}, {{company}}</p>`}
                            className="w-full px-3 py-2.5 border border-pulse-border rounded-lg text-xs font-mono leading-relaxed focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all motion-reduce:transition-none bg-pulse-panel text-pulse-text placeholder:text-pulse-faint resize-y"
                        />
                        <SettingHint>
                            Available variables: {VARIABLE_HINTS.map((v, i) => (
                                <code key={v} className={`px-1 py-0.5 rounded bg-pulse-panel-alt text-pulse-text-soft ${i > 0 ? "ml-1" : ""}`}>
                                    {v}
                                </code>
                            ))}
                        </SettingHint>
                    </div>
                )}

                {/* Live preview */}
                <div>
                    <label className="block text-xs font-medium text-pulse-text-soft mb-1.5">Preview</label>
                    <div className="rounded-lg border border-pulse-border-subtle overflow-hidden bg-white">
                        <iframe
                            title="Signature preview"
                            sandbox=""
                            srcDoc={previewDoc}
                            className="w-full"
                            style={{ minHeight: "140px", border: "none", display: "block" }}
                        />
                    </div>
                </div>
            </div>
        </Card>
    );
}
