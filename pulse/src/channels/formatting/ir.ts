/**
 * Intermediate Representation (IR) for channel-agnostic message formatting.
 *
 * The pipeline: Markdown → IR → channel-specific render (Telegram HTML, WhatsApp, Slack, plain)
 */

export type StyleType = "bold" | "italic" | "strikethrough" | "code" | "codeblock" | "blockquote";

export interface StyleSpan {
    start: number;
    end: number;
    style: StyleType;
    /** For codeblock — optional language hint */
    language?: string;
}

export interface LinkSpan {
    start: number;
    end: number;
    href: string;
}

export interface MessageIR {
    text: string;
    styles: StyleSpan[];
    links: LinkSpan[];
}

/**
 * Parse Markdown into a MessageIR.
 *
 * Handles: code blocks, inline code, bold, italic, strikethrough, links, blockquotes.
 * No external dependencies.
 */
export function markdownToIR(markdown: string): MessageIR {
    const styles: StyleSpan[] = [];
    const links: LinkSpan[] = [];

    let text = "";
    let src = markdown;

    // Phase 1: Extract fenced code blocks (``` ... ```)
    const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
    const codeBlocks: { original: string; content: string; lang: string }[] = [];
    let cbMatch: RegExpExecArray | null;
    while ((cbMatch = codeBlockRegex.exec(src)) !== null) {
        codeBlocks.push({
            original: cbMatch[0],
            content: cbMatch[2].trimEnd(),
            lang: cbMatch[1] || "",
        });
    }

    // Replace code blocks with placeholders
    const CB_PREFIX = "\x00CB";
    let processed = src;
    for (let i = 0; i < codeBlocks.length; i++) {
        processed = processed.replace(codeBlocks[i].original, `${CB_PREFIX}${i}\x00`);
    }

    // Phase 2: Extract inline code (` ... `)
    const inlineCodeRegex = /`([^`\n]+)`/g;
    const inlineCodes: { original: string; content: string }[] = [];
    let icMatch: RegExpExecArray | null;
    while ((icMatch = inlineCodeRegex.exec(processed)) !== null) {
        inlineCodes.push({ original: icMatch[0], content: icMatch[1] });
    }
    const IC_PREFIX = "\x00IC";
    for (let i = 0; i < inlineCodes.length; i++) {
        processed = processed.replace(inlineCodes[i].original, `${IC_PREFIX}${i}\x00`);
    }

    // Phase 3: Extract links [text](url)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const linkEntries: { original: string; label: string; href: string }[] = [];
    let lkMatch: RegExpExecArray | null;
    while ((lkMatch = linkRegex.exec(processed)) !== null) {
        linkEntries.push({ original: lkMatch[0], label: lkMatch[1], href: lkMatch[2] });
    }
    const LK_PREFIX = "\x00LK";
    for (let i = 0; i < linkEntries.length; i++) {
        processed = processed.replace(linkEntries[i].original, `${LK_PREFIX}${i}\x00`);
    }

    // Phase 4: Process line by line for blockquotes and inline styles
    const lines = processed.split("\n");
    let blockquoteStart = -1;

    for (let li = 0; li < lines.length; li++) {
        let line = lines[li];
        const isBlockquote = line.startsWith("> ");

        if (isBlockquote) {
            line = line.slice(2);
            if (blockquoteStart === -1) blockquoteStart = text.length;
        } else {
            if (blockquoteStart !== -1) {
                styles.push({ start: blockquoteStart, end: text.length, style: "blockquote" });
                blockquoteStart = -1;
            }
        }

        // Process inline formatting within the line
        const lineStart = text.length;
        let buf = line;

        // Bold (**text**)
        buf = buf.replace(/\*\*(.+?)\*\*/g, (_, content) => {
            const placeholder = `\x01B${styles.length}\x01`;
            const start = 0; // will be resolved after assembly
            styles.push({ start: -1, end: -1, style: "bold" }); // placeholder — resolve later
            return placeholder;
        });

        // Italic (*text*)
        buf = buf.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, (_, content) => {
            const placeholder = `\x01I${styles.length}\x01`;
            styles.push({ start: -1, end: -1, style: "italic" });
            return placeholder;
        });

        // Strikethrough (~~text~~)
        buf = buf.replace(/~~(.+?)~~/g, (_, content) => {
            const placeholder = `\x01S${styles.length}\x01`;
            styles.push({ start: -1, end: -1, style: "strikethrough" });
            return placeholder;
        });

        text += (li > 0 ? "\n" : "") + buf;
    }

    // Close trailing blockquote
    if (blockquoteStart !== -1) {
        styles.push({ start: blockquoteStart, end: text.length, style: "blockquote" });
    }

    // The placeholder approach above was getting complex. Let's do a simpler second-pass approach.
    // Reset and use a direct two-pass strategy.

    // --- Simpler approach: Build text + spans in a single pass ---
    return markdownToIRSimple(markdown);
}

/**
 * Simple single-pass markdown-to-IR conversion.
 */
function markdownToIRSimple(markdown: string): MessageIR {
    const styles: StyleSpan[] = [];
    const links: LinkSpan[] = [];

    // Step 1: Extract and replace code blocks with placeholders
    const codeBlocks: { content: string; lang: string }[] = [];
    let work = markdown.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
        const idx = codeBlocks.length;
        codeBlocks.push({ content: code.trimEnd(), lang: lang || "" });
        return `\x00CB${idx}\x00`;
    });

    // Step 2: Extract and replace inline code
    const inlineCodes: string[] = [];
    work = work.replace(/`([^`\n]+)`/g, (_, code) => {
        const idx = inlineCodes.length;
        inlineCodes.push(code);
        return `\x00IC${idx}\x00`;
    });

    // Step 3: Extract and replace links
    const linkEntries: { label: string; href: string }[] = [];
    work = work.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
        const idx = linkEntries.length;
        linkEntries.push({ label, href });
        return `\x00LK${idx}\x00`;
    });

    // Step 4: Extract and replace bold
    const boldEntries: string[] = [];
    work = work.replace(/\*\*(.+?)\*\*/g, (_, content) => {
        const idx = boldEntries.length;
        boldEntries.push(content);
        return `\x00BO${idx}\x00`;
    });

    // Step 5: Extract and replace italic
    const italicEntries: string[] = [];
    work = work.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, (_, content) => {
        const idx = italicEntries.length;
        italicEntries.push(content);
        return `\x00IT${idx}\x00`;
    });

    // Step 6: Extract and replace strikethrough
    const strikeEntries: string[] = [];
    work = work.replace(/~~(.+?)~~/g, (_, content) => {
        const idx = strikeEntries.length;
        strikeEntries.push(content);
        return `\x00ST${idx}\x00`;
    });

    // Step 7: Build the final text, resolving placeholders and recording spans
    let text = "";
    const placeholderRegex = /\x00(CB|IC|LK|BO|IT|ST)(\d+)\x00/g;
    let cursor = 0;
    let m: RegExpExecArray | null;

    // Process line by line for blockquotes, then resolve placeholders
    const lines = work.split("\n");
    const assembled: string[] = [];
    const blockquoteRanges: [number, number][] = [];
    let bqStart = -1;
    let lineOffset = 0;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (i > 0) lineOffset++; // account for \n

        if (line.startsWith("> ")) {
            line = line.slice(2);
            if (bqStart === -1) bqStart = lineOffset;
        } else {
            if (bqStart !== -1) {
                blockquoteRanges.push([bqStart, lineOffset]);
                bqStart = -1;
            }
        }

        assembled.push(line);
        lineOffset += line.length;
    }

    if (bqStart !== -1) {
        blockquoteRanges.push([bqStart, lineOffset]);
    }

    const joined = assembled.join("\n");

    // Now resolve all placeholders in `joined` to build final `text` + spans
    text = "";
    cursor = 0;
    placeholderRegex.lastIndex = 0;

    while ((m = placeholderRegex.exec(joined)) !== null) {
        // Append text before this placeholder
        text += joined.slice(cursor, m.index);
        const pos = text.length;
        const type = m[1];
        const idx = parseInt(m[2]);

        switch (type) {
            case "CB": {
                const cb = codeBlocks[idx];
                text += cb.content;
                styles.push({ start: pos, end: text.length, style: "codeblock", language: cb.lang || undefined });
                break;
            }
            case "IC": {
                const ic = inlineCodes[idx];
                text += ic;
                styles.push({ start: pos, end: text.length, style: "code" });
                break;
            }
            case "LK": {
                const lk = linkEntries[idx];
                text += lk.label;
                links.push({ start: pos, end: text.length, href: lk.href });
                break;
            }
            case "BO": {
                const content = boldEntries[idx];
                text += content;
                styles.push({ start: pos, end: text.length, style: "bold" });
                break;
            }
            case "IT": {
                const content = italicEntries[idx];
                text += content;
                styles.push({ start: pos, end: text.length, style: "italic" });
                break;
            }
            case "ST": {
                const content = strikeEntries[idx];
                text += content;
                styles.push({ start: pos, end: text.length, style: "strikethrough" });
                break;
            }
        }

        cursor = m.index + m[0].length;
    }

    // Append remaining text
    text += joined.slice(cursor);

    // Adjust blockquote ranges — they were computed on the placeholder-containing string,
    // but since blockquotes are line-level and placeholders don't change line count,
    // we need to recalculate based on final text. Do a quick rescan.
    const finalLines = text.split("\n");
    // We already stripped "> " during assembly, so blockquotes are already in the correct position.
    // Use the pre-computed ranges mapped to final text offsets.
    // Actually, the blockquote offsets computed above are character offsets in the assembled string,
    // which differs from final text after placeholder resolution. Re-scan from original.

    // Re-derive blockquote spans from the original markdown
    const origLines = markdown.split("\n");
    let origOffset = 0;
    let finalOffset = 0;
    let bqStartFinal = -1;

    // Walk through original lines and map to final text lines
    const finalLinesArr = text.split("\n");
    let finalLineIdx = 0;
    for (let i = 0; i < origLines.length; i++) {
        const isQuote = origLines[i].startsWith("> ");
        const finalLineLen = finalLineIdx < finalLinesArr.length ? finalLinesArr[finalLineIdx].length : 0;

        if (isQuote) {
            if (bqStartFinal === -1) bqStartFinal = finalOffset;
        } else {
            if (bqStartFinal !== -1) {
                styles.push({ start: bqStartFinal, end: finalOffset > 0 ? finalOffset - 1 : 0, style: "blockquote" });
                bqStartFinal = -1;
            }
        }

        finalOffset += finalLineLen + 1; // +1 for newline
        finalLineIdx++;
    }

    if (bqStartFinal !== -1) {
        styles.push({ start: bqStartFinal, end: text.length, style: "blockquote" });
    }

    return { text, styles, links };
}

/**
 * Chunk a MessageIR at block boundaries respecting maxLength.
 * Slices style/link spans per chunk.
 */
export function chunkIR(ir: MessageIR, maxLength = 4096): MessageIR[] {
    if (ir.text.length <= maxLength) return [ir];

    const chunks: MessageIR[] = [];
    let remaining = ir.text;
    let globalOffset = 0;

    while (remaining.length > 0) {
        let cut: number;
        if (remaining.length <= maxLength) {
            cut = remaining.length;
        } else {
            // Find split point at paragraph, newline, or space
            const para = remaining.lastIndexOf("\n\n", maxLength);
            const nl = remaining.lastIndexOf("\n", maxLength);
            const sp = remaining.lastIndexOf(" ", maxLength);
            const minFill = Math.floor(maxLength * 0.3);

            if (para >= minFill) cut = para + 2;
            else if (nl >= minFill) cut = nl + 1;
            else if (sp >= minFill) cut = sp + 1;
            else cut = maxLength;
        }

        const chunkText = remaining.slice(0, cut);
        const chunkEnd = globalOffset + cut;

        // Slice spans that overlap this chunk
        const chunkStyles: StyleSpan[] = [];
        for (const s of ir.styles) {
            if (s.end <= globalOffset || s.start >= chunkEnd) continue;
            chunkStyles.push({
                start: Math.max(0, s.start - globalOffset),
                end: Math.min(cut, s.end - globalOffset),
                style: s.style,
                language: s.language,
            });
        }

        const chunkLinks: LinkSpan[] = [];
        for (const l of ir.links) {
            if (l.end <= globalOffset || l.start >= chunkEnd) continue;
            chunkLinks.push({
                start: Math.max(0, l.start - globalOffset),
                end: Math.min(cut, l.end - globalOffset),
                href: l.href,
            });
        }

        chunks.push({ text: chunkText.trimEnd(), styles: chunkStyles, links: chunkLinks });
        remaining = remaining.slice(cut).trimStart();
        globalOffset = chunkEnd + (cut - remaining.length - (remaining.length)); // approximate
        globalOffset = chunkEnd;
    }

    return chunks;
}
