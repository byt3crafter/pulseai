/**
 * WhatsApp renderer for MessageIR.
 */

import { MessageIR } from "./ir.js";
import { renderIR } from "./render.js";
import type { StyleType } from "./ir.js";
import type { StyleMarker } from "./render.js";

const WHATSAPP_MARKERS: Partial<Record<StyleType, StyleMarker>> = {
    bold: { open: "*", close: "*" },
    italic: { open: "_", close: "_" },
    strikethrough: { open: "~", close: "~" },
    code: { open: "`", close: "`" },
    codeblock: { open: "```\n", close: "\n```" },
};

export function renderWhatsApp(ir: MessageIR): string {
    return renderIR(ir, {
        styleMarkers: WHATSAPP_MARKERS,
        formatLink: (href, label) => `${label} (${href})`,
    });
}
