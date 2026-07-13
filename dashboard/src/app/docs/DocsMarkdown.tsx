"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { slugifyHeading } from "./slugify";

function headingText(children: React.ReactNode): string {
    if (typeof children === "string") return children;
    if (Array.isArray(children)) return children.map(headingText).join("");
    if (children && typeof children === "object" && "props" in (children as any)) {
        return headingText((children as any).props?.children);
    }
    return "";
}

/**
 * Docs prose renderer. Styling lives in globals.css under `.docs-md`.
 * Headings get id anchors so the "On this page" rail can link into them.
 */
export default function DocsMarkdown({ children }: { children: string }) {
    return (
        <div className="docs-md">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    h2: ({ children }) => <h2 id={slugifyHeading(headingText(children))}>{children}</h2>,
                    h3: ({ children }) => <h3 id={slugifyHeading(headingText(children))}>{children}</h3>,
                    table: ({ children }) => (
                        <div className="docs-table-wrap">
                            <table>{children}</table>
                        </div>
                    ),
                }}
            >
                {children}
            </ReactMarkdown>
        </div>
    );
}
