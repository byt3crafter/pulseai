/**
 * Generic IR renderer — converts MessageIR to a string using marker maps.
 *
 * Each channel provides its own StyleMarker and LinkFormatter, then calls renderIR().
 */

import { MessageIR, StyleType, StyleSpan, LinkSpan } from "./ir.js";

export interface StyleMarker {
    open: string;
    close: string;
}

export interface RenderOptions {
    styleMarkers: Partial<Record<StyleType, StyleMarker>>;
    formatLink?: (href: string, label: string) => string;
    escapeText?: (text: string) => string;
}

interface SpanEvent {
    offset: number;
    /** Positive = opens, negative = closes. Absolute value is the span index in the combined array. */
    type: "open" | "close";
    marker: string;
    /** For sorting: closes before opens at same offset, and order matters for nesting */
    priority: number;
}

export function renderIR(ir: MessageIR, options: RenderOptions): string {
    const { styleMarkers, formatLink, escapeText } = options;

    // Build events from style spans
    const events: SpanEvent[] = [];

    for (const span of ir.styles) {
        const marker = styleMarkers[span.style];
        if (!marker) continue;

        events.push({
            offset: span.start,
            type: "open",
            marker: marker.open,
            priority: 1,
        });
        events.push({
            offset: span.end,
            type: "close",
            marker: marker.close,
            priority: -1,
        });
    }

    // Build events from link spans
    for (const link of ir.links) {
        if (formatLink) {
            // Links are special — we need to wrap the text range with the formatted link
            // We'll handle this as open/close markers with the href baked in
            const label = ir.text.slice(link.start, link.end);
            const formatted = formatLink(link.href, label);
            events.push({
                offset: link.start,
                type: "open",
                marker: `\x02LINK_START:${events.length}\x02`,
                priority: 0,
            });
            events.push({
                offset: link.end,
                type: "close",
                marker: `\x02LINK_END:${events.length}\x02`,
                priority: 0,
            });
        }
    }

    // Sort events: by offset, then closes before opens at same offset
    events.sort((a, b) => {
        if (a.offset !== b.offset) return a.offset - b.offset;
        return a.priority - b.priority;
    });

    // Build output string
    const parts: string[] = [];
    let cursor = 0;

    // Simpler approach: process spans as insertions at boundaries
    // Collect all boundary offsets
    const boundaries = new Set<number>();
    for (const e of events) boundaries.add(e.offset);
    const sortedBoundaries = Array.from(boundaries).sort((a, b) => a - b);

    // For links, pre-compute the full formatted strings
    const linkMap = new Map<number, { start: number; end: number; formatted: string }>();
    if (formatLink) {
        for (const link of ir.links) {
            linkMap.set(link.start, {
                start: link.start,
                end: link.end,
                formatted: formatLink(link.href, ""),
            });
        }
    }

    // Simpler approach: direct text assembly with markers at correct positions
    // Gather open/close markers keyed by offset
    const openAt = new Map<number, string[]>();
    const closeAt = new Map<number, string[]>();

    for (const span of ir.styles) {
        const marker = styleMarkers[span.style];
        if (!marker) continue;

        if (!openAt.has(span.start)) openAt.set(span.start, []);
        openAt.get(span.start)!.push(marker.open);

        if (!closeAt.has(span.end)) closeAt.set(span.end, []);
        closeAt.get(span.end)!.push(marker.close);
    }

    // Process links separately — they replace the text range entirely
    // Sort links by start position
    const sortedLinks = [...ir.links].sort((a, b) => a.start - b.start);
    const linkRanges = new Set<string>();
    for (const l of sortedLinks) {
        for (let i = l.start; i < l.end; i++) linkRanges.add(`${l.start}:${i}`);
    }

    // Build output character by character with marker insertions
    let result = "";
    const linkStarts = new Map(sortedLinks.map((l) => [l.start, l]));
    const linkEnds = new Set(sortedLinks.map((l) => l.end));
    let insideLink: LinkSpan | null = null;
    let linkTextBuffer = "";

    for (let i = 0; i <= ir.text.length; i++) {
        // Close markers at this position (reverse order for proper nesting)
        const closes = closeAt.get(i);
        if (closes) {
            for (let j = closes.length - 1; j >= 0; j--) {
                if (insideLink) {
                    linkTextBuffer += closes[j];
                } else {
                    result += closes[j];
                }
            }
        }

        // Handle link end
        if (insideLink && i === insideLink.end) {
            if (formatLink) {
                result += formatLink(insideLink.href, linkTextBuffer);
            } else {
                result += linkTextBuffer;
            }
            insideLink = null;
            linkTextBuffer = "";
        }

        // Handle link start
        const linkStart = linkStarts.get(i);
        if (linkStart && !insideLink) {
            insideLink = linkStart;
            linkTextBuffer = "";
        }

        // Open markers at this position
        const opens = openAt.get(i);
        if (opens) {
            for (const o of opens) {
                if (insideLink) {
                    linkTextBuffer += o;
                } else {
                    result += o;
                }
            }
        }

        // Append character
        if (i < ir.text.length) {
            const ch = ir.text[i];
            const escaped = escapeText ? escapeText(ch) : ch;
            if (insideLink) {
                linkTextBuffer += escaped;
            } else {
                result += escaped;
            }
        }
    }

    return result;
}
