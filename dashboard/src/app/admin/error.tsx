"use client";

export default function AdminError({ error, reset }: { error: Error; reset: () => void }) {
    return (
        <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
                <h2 className="text-lg font-semibold text-slate-200 mb-2">Something went wrong</h2>
                <p className="text-sm text-slate-400 mb-4">An unexpected error occurred.</p>
                <button
                    onClick={reset}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-500 transition-colors"
                >
                    Try again
                </button>
            </div>
        </div>
    );
}
