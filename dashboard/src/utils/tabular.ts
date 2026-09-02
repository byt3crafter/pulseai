/**
 * Turn pasted CSV / Excel (TSV) blocks inside a chat message into GFM markdown
 * tables so they render as an aligned, horizontally-scrollable table instead of a
 * wrapped wall of comma-separated text.
 *
 * Deliberately conservative — it only rewrites a run of consecutive lines that
 * genuinely looks tabular (a consistent delimiter, enough columns, enough rows).
 * Prose, code, and existing markdown tables are left untouched, and a raggedy
 * block that isn't really a table is returned verbatim.
 */

type Delim = { char: string; minCols: number };

// Excel copy/paste is tab-separated; CSV is comma-separated. We require more
// columns for comma than tab because prose can contain a couple of commas but
// almost never contains tabs.
const DELIMS: Delim[] = [
    { char: "\t", minCols: 2 },
    { char: ",", minCols: 3 },
];

/** Split one CSV/TSV line into fields, honouring simple double-quoted cells. */
function splitFields(line: string, delim: string): string[] {
    if (delim === "\t") return line.split("\t");
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; } // escaped quote
            else inQuotes = !inQuotes;
        } else if (ch === delim && !inQuotes) {
            out.push(cur); cur = "";
        } else {
            cur += ch;
        }
    }
    out.push(cur);
    return out;
}

/** The count that appears most often in a list (ties → the larger count). */
function modal(counts: number[]): number {
    const freq = new Map<number, number>();
    for (const c of counts) freq.set(c, (freq.get(c) || 0) + 1);
    let best = 0, bestN = 0;
    for (const [c, n] of freq) if (n > bestN || (n === bestN && c > best)) { best = c; bestN = n; }
    return best;
}

/** A markdown table row (already pipe-delimited) — leave those alone. */
function looksLikeMarkdownTable(line: string): boolean {
    return /^\s*\|.*\|\s*$/.test(line);
}

function escapeCell(s: string): string {
    return s.trim().replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/** Build a GFM table from a block of rows, normalised to `cols` columns. */
function toMarkdownTable(rows: string[][], cols: number): string {
    const norm = (r: string[]) => {
        const c = r.slice(0, cols).map(escapeCell);
        while (c.length < cols) c.push("");
        return `| ${c.join(" | ")} |`;
    };
    const header = norm(rows[0]);
    const sep = `| ${Array(cols).fill("---").join(" | ")} |`;
    const body = rows.slice(1).map(norm);
    return [header, sep, ...body].join("\n");
}

export function formatTabularText(text: string): string {
    if (!text || (!text.includes(",") && !text.includes("\t"))) return text;
    const lines = text.split("\n");
    const out: string[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        // Pick a delimiter this line qualifies for (and isn't already a md table).
        const delim = looksLikeMarkdownTable(line)
            ? null
            : DELIMS.find((d) => line.includes(d.char) && splitFields(line, d.char).length >= d.minCols);

        if (!delim) { out.push(line); i++; continue; }

        // Gather the maximal run of consecutive lines with this same delimiter.
        const block: string[] = [];
        let j = i;
        while (
            j < lines.length &&
            lines[j].trim() !== "" &&
            !looksLikeMarkdownTable(lines[j]) &&
            splitFields(lines[j], delim.char).length >= 2
        ) {
            block.push(lines[j]); j++;
        }

        const counts = block.map((l) => splitFields(l, delim.char).length);
        const cols = modal(counts);
        const consistent = counts.filter((c) => c === cols).length / block.length;

        // Only convert a real table: 2+ rows, enough columns, mostly-uniform width.
        if (block.length >= 2 && cols >= delim.minCols && consistent >= 0.6) {
            const rows = block.map((l) => splitFields(l, delim.char));
            // A blank line before the table so GFM recognises the block.
            if (out.length && out[out.length - 1].trim() !== "") out.push("");
            out.push(toMarkdownTable(rows, cols));
            out.push("");
            i = j;
        } else {
            out.push(line); i++;
        }
    }

    return out.join("\n");
}
