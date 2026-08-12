"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Repair the common markdown mistakes weaker models make before rendering, so a
 * botched table still comes out readable instead of a wall of raw pipes:
 *  - Un-cram collapsed table rows: the model puts every row on ONE line joined by
 *    "| |" instead of newlines. Split those back onto their own lines.
 *  - Ensure a blank line before a table/heading that's glued to a paragraph
 *    (GFM needs the separation to recognise the block).
 * Only triggers on clearly-malformed lines, so well-formed markdown is untouched.
 */
function repairMarkdown(md: string): string {
    const lines = md.split("\n").map((line) => {
        // A single line with 3+ "| |" row-joins is a collapsed table — un-cram it.
        if ((line.match(/\|\s\|/g) || []).length >= 3) {
            return line.replace(/\|\s\|/g, "|\n|");
        }
        return line;
    });
    return lines
        .join("\n")
        // Blank line before a table row glued to non-table text.
        .replace(/([^\n|>])\n(\|[^\n]*\|)/g, "$1\n\n$2")
        // Blank line before a heading glued to preceding text.
        .replace(/([^\n])\n(#{1,4}\s)/g, "$1\n\n$2");
}

/**
 * Renders agent message text as markdown (headings, bold, lists, code, tables,
 * links) — the ChatGPT/Claude look. Styling lives in globals.css under `.md`.
 * react-markdown escapes raw HTML by default, so this is safe for agent output.
 */
export default function Markdown({ children }: { children: string }) {
    return (
        <div className="md">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    a: ({ node, ...props }) => <a target="_blank" rel="noopener noreferrer" {...props} />,
                }}
            >
                {repairMarkdown(children)}
            </ReactMarkdown>
        </div>
    );
}
