import Link from "next/link";

/**
 * On tokens, like every other unauthenticated page.
 *
 * This was hardcoded light (bg-slate-50, text-slate-900, indigo button), so a
 * workspace on dark mode got a white flash on any bad URL — the same defect the
 * login pages had, in the last place anyone thinks to look.
 */
export default function NotFound() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-pulse-bg p-8">
            <h2 className="mb-2 text-[22px] font-semibold tracking-[-0.01em] text-pulse-text">Page not found</h2>
            <p className="mb-6 text-[13px] text-pulse-muted">We couldn&apos;t find the page you were looking for.</p>
            <Link
                href="/"
                className="rounded-lg bg-pulse-accent px-4 py-2 text-[13.5px] font-medium text-white transition-colors hover:bg-pulse-accent-hi"
            >
                Return home
            </Link>
        </div>
    );
}
