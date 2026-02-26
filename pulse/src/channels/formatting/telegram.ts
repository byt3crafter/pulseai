/**
 * Telegram HTML renderer for MessageIR.
 */

import { MessageIR } from "./ir.js";
import { renderIR, StyleMarker } from "./render.js";
import type { StyleType } from "./ir.js";

const TELEGRAM_MARKERS: Record<StyleType, StyleMarker> = {
    bold: { open: "<b>", close: "</b>" },
    italic: { open: "<i>", close: "</i>" },
    strikethrough: { open: "<s>", close: "</s>" },
    code: { open: "<code>", close: "</code>" },
    codeblock: { open: "<pre>", close: "</pre>" },
    blockquote: { open: "<blockquote>", close: "</blockquote>" },
};

function escapeHtml(ch: string): string {
    switch (ch) {
        case "&": return "&amp;";
        case "<": return "&lt;";
        case ">": return "&gt;";
        default: return ch;
    }
}

export function renderTelegramHtml(ir: MessageIR): string {
    return renderIR(ir, {
        styleMarkers: TELEGRAM_MARKERS,
        formatLink: (href, label) => `<a href="${href}">${label}</a>`,
        escapeText: escapeHtml,
    });
}
