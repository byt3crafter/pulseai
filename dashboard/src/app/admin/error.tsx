"use client";

export default function AdminError({ error, reset }: { error: Error; reset: () => void }) {
    return (
        <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
                <h2 className="text-lg font-semibold text-pulse-text mb-2">Something went wrong</h2>
                <p className="text-sm text-pulse-muted mb-4">An unexpected error occurred.</p>
                <button
                    onClick={reset}
                    className="px-4 py-2 bg-pulse-accent text-white rounded-lg text-sm hover:bg-pulse-accent-hi transition-colors"
                >
                    Try again
                </button>
            </div>
        </div>
    );
}
