"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
                {children}
            </ReactMarkdown>
        </div>
    );
}
