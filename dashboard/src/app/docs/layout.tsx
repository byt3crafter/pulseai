import Link from "next/link";
import type { Metadata } from "next";
import ThemeToggle from "../../components/ThemeToggle";
import PulseLogo from "../PulseLogo";
import DocsSidebar from "./DocsSidebar";

export const metadata: Metadata = {
    title: {
        default: "Pulse Documentation",
        template: "%s — Pulse Docs",
    },
    description: "How to set up and run your agentic AI workforce with Pulse.",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-pulse-bg text-pulse-text">
            <header className="sticky top-0 z-30 h-14 border-b border-pulse-border bg-pulse-bg/85 backdrop-blur">
                <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-5">
                    <div className="flex items-center gap-3">
                        <Link href="/" className="flex items-center gap-2">
                            <PulseLogo size={28} showText={false} />
                            <span className="text-sm font-semibold text-pulse-text">Pulse</span>
                        </Link>
                        <span className="text-pulse-faint">/</span>
                        <Link href="/docs" className="text-sm font-medium text-pulse-soft hover:text-pulse-text">
                            Docs
                        </Link>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link
                            href="/dashboard"
                            className="rounded-lg border border-pulse-border px-3 py-1.5 text-sm text-pulse-soft transition-colors hover:bg-pulse-hover hover:text-pulse-text"
                        >
                            Open dashboard
                        </Link>
                        <ThemeToggle />
                    </div>
                </div>
            </header>

            <div className="mx-auto flex max-w-7xl gap-10 px-5">
                <DocsSidebar />
                <main className="min-w-0 flex-1 py-10 lg:py-12">{children}</main>
            </div>
        </div>
    );
}
