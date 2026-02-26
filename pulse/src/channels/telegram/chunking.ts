/**
 * Smart message chunking for Telegram's 4096-character limit.
 *
 * Splits at natural boundaries: paragraph > newline > sentence > space > hard.
 * Ensures minimum 30% fill per chunk to avoid slivers.
 */

const MIN_FILL_RATIO = 0.3;

/**
 * Split plain text into chunks respecting Telegram's max message length.
 */
export function chunkMessage(text: string, maxLength = 4096): string[] {
    if (text.length <= maxLength) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            chunks.push(remaining);
            break;
        }

        const cut = findSplitPoint(remaining, maxLength);
        chunks.push(remaining.slice(0, cut).trimEnd());
        remaining = remaining.slice(cut).trimStart();
    }

    return chunks.filter((c) => c.length > 0);
}

/**
 * Split HTML text into chunks, ensuring unclosed tags are balanced per chunk.
 */
export function chunkHtmlMessage(html: string, maxLength = 4096): string[] {
    if (html.length <= maxLength) return [html];

    const chunks: string[] = [];
    let remaining = html;

    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            chunks.push(ensureClosedTags(remaining));
            break;
        }

        const cut = findSplitPoint(remaining, maxLength);
        const raw = remaining.slice(0, cut).trimEnd();
        chunks.push(ensureClosedTags(raw));
        remaining = reopenTags(raw) + remaining.slice(cut).trimStart();
    }

    return chunks.filter((c) => c.length > 0);
}

function findSplitPoint(text: string, maxLength: number): number {
    const minFill = Math.floor(maxLength * MIN_FILL_RATIO);

    // Try paragraph break
    const paraIdx = text.lastIndexOf("\n\n", maxLength);
    if (paraIdx >= minFill) return paraIdx + 2;

    // Try newline
    const nlIdx = text.lastIndexOf("\n", maxLength);
    if (nlIdx >= minFill) return nlIdx + 1;

    // Try sentence boundary (. ! ?)
    const sentenceRegex = /[.!?]\s/g;
    let lastSentence = -1;
    let match: RegExpExecArray | null;
    while ((match = sentenceRegex.exec(text)) !== null) {
        if (match.index + 2 > maxLength) break;
        lastSentence = match.index + 2;
    }
    if (lastSentence >= minFill) return lastSentence;

    // Try space
    const spaceIdx = text.lastIndexOf(" ", maxLength);
    if (spaceIdx >= minFill) return spaceIdx + 1;

    // Hard split
    return maxLength;
}

/** Telegram-supported tags that need balancing */
const PAIRED_TAGS = ["b", "i", "s", "code", "pre", "a", "blockquote"];

/**
 * Close any unclosed HTML tags at the end of a chunk.
 */
export function ensureClosedTags(html: string): string {
    const openStack: string[] = [];
    const tagRegex = /<\/?([a-z]+)(?:\s[^>]*)?\/?>/gi;
    let m: RegExpExecArray | null;

    while ((m = tagRegex.exec(html)) !== null) {
        const full = m[0];
        const tagName = m[1].toLowerCase();
        if (!PAIRED_TAGS.includes(tagName)) continue;

        if (full.startsWith("</")) {
            // Closing tag — pop matching open
            const idx = openStack.lastIndexOf(tagName);
            if (idx !== -1) openStack.splice(idx, 1);
        } else if (!full.endsWith("/>")) {
            // Opening tag
            openStack.push(tagName);
        }
    }

    // Close remaining open tags in reverse order
    let result = html;
    for (let i = openStack.length - 1; i >= 0; i--) {
        result += `</${openStack[i]}>`;
    }
    return result;
}

/**
 * Determine which tags were open at the end of a chunk so the next chunk
 * can re-open them.
 */
function reopenTags(html: string): string {
    const openStack: { tag: string; full: string }[] = [];
    const tagRegex = /<\/?([a-z]+)(?:\s[^>]*)?\/?>/gi;
    let m: RegExpExecArray | null;

    while ((m = tagRegex.exec(html)) !== null) {
        const full = m[0];
        const tagName = m[1].toLowerCase();
        if (!PAIRED_TAGS.includes(tagName)) continue;

        if (full.startsWith("</")) {
            // Find last matching open tag (manual findLastIndex for compat)
            let idx = -1;
            for (let i = openStack.length - 1; i >= 0; i--) {
                if (openStack[i].tag === tagName) { idx = i; break; }
            }
            if (idx !== -1) openStack.splice(idx, 1);
        } else if (!full.endsWith("/>")) {
            openStack.push({ tag: tagName, full });
        }
    }

    return openStack.map((e) => e.full).join("");
}
