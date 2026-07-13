import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ALL_DOCS, DOCS_NAV, docHref, findDoc, segmentsToSlug } from "../nav";
import DocsMarkdown from "../DocsMarkdown";
import { slugifyHeading } from "../slugify";

/**
 * These pages live inside the dashboard (auth-gated), whose layout is
 * force-dynamic — so they can't be prerendered. The markdown is therefore read
 * at request time, and `next.config.ts` traces `src/content/docs` into the
 * standalone output so those files exist in the container.
 */
export const dynamic = "force-dynamic";

const CONTENT_DIR = path.join(process.cwd(), "src", "content", "docs");

function readDoc(slug: string): string | null {
    const file = path.join(CONTENT_DIR, `${slug || "index"}.md`);
    try {
        return fs.readFileSync(file, "utf8");
    } catch {
        return null;
    }
}

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }): Promise<Metadata> {
    const { slug } = await params;
    const doc = findDoc(segmentsToSlug(slug));
    if (!doc) return { title: "Not found" };
    return {
        title: doc.title,
        description: doc.description,
    };
}

/** Pull `## ` headings out of the raw markdown for the "On this page" rail. */
function tableOfContents(markdown: string): { id: string; title: string }[] {
    const out: { id: string; title: string }[] = [];
    let inFence = false;
    for (const line of markdown.split("\n")) {
        if (line.startsWith("```")) inFence = !inFence;
        if (inFence) continue;
        const match = /^## (.+)$/.exec(line);
        if (match) {
            const title = match[1].trim();
            out.push({ id: slugifyHeading(title), title });
        }
    }
    return out;
}

export default async function DocPage({ params }: { params: Promise<{ slug?: string[] }> }) {
    const { slug } = await params;
    const key = segmentsToSlug(slug);
    const doc = findDoc(key);
    if (!doc) notFound();

    const markdown = readDoc(key);
    if (markdown === null) notFound();

    const toc = tableOfContents(markdown);

    // Previous / next within the flat reading order.
    const index = ALL_DOCS.findIndex((p) => p.slug === key);
    const prev = index > 0 ? ALL_DOCS[index - 1] : null;
    const next = index >= 0 && index < ALL_DOCS.length - 1 ? ALL_DOCS[index + 1] : null;
    const section = DOCS_NAV.find((s) => s.pages.some((p) => p.slug === key));

    return (
        <div className="flex gap-10">
            <article className="min-w-0 flex-1 pb-16">
                {section && (
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-pulse-accent">
                        {section.title}
                    </p>
                )}
                <h1 className="text-3xl font-semibold tracking-tight text-pulse-text">{doc.title}</h1>
                <p className="mt-2 text-base text-pulse-muted">{doc.description}</p>
                <hr className="my-8 border-pulse-border" />

                <DocsMarkdown>{markdown}</DocsMarkdown>

                <nav className="mt-16 flex items-stretch gap-4 border-t border-pulse-border pt-6">
                    {prev ? (
                        <Link
                            href={docHref(prev.slug)}
                            className="flex-1 rounded-lg border border-pulse-border p-4 transition-colors hover:bg-pulse-hover"
                        >
                            <span className="block text-xs text-pulse-faint">Previous</span>
                            <span className="mt-0.5 block text-sm font-medium text-pulse-text">{prev.title}</span>
                        </Link>
                    ) : (
                        <span className="flex-1" />
                    )}
                    {next ? (
                        <Link
                            href={docHref(next.slug)}
                            className="flex-1 rounded-lg border border-pulse-border p-4 text-right transition-colors hover:bg-pulse-hover"
                        >
                            <span className="block text-xs text-pulse-faint">Next</span>
                            <span className="mt-0.5 block text-sm font-medium text-pulse-text">{next.title}</span>
                        </Link>
                    ) : (
                        <span className="flex-1" />
                    )}
                </nav>
            </article>

            {toc.length > 1 && (
                <aside className="sticky top-6 hidden h-fit w-56 shrink-0 xl:block">
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-pulse-faint">
                        On this page
                    </p>
                    <ul className="flex flex-col gap-1.5 border-l border-pulse-border">
                        {toc.map((item) => (
                            <li key={item.id}>
                                <a
                                    href={`#${item.id}`}
                                    className="-ml-px block border-l border-transparent pl-3 text-sm text-pulse-muted transition-colors hover:border-pulse-accent hover:text-pulse-text"
                                >
                                    {item.title}
                                </a>
                            </li>
                        ))}
                    </ul>
                </aside>
            )}
        </div>
    );
}
