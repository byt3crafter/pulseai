"use client";

export default function AdminError({ error, reset }: { error: Error; reset: () => void }) {
    return (
        <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
                <h2 className="text-lg font-semibold text-[#EDEDED] mb-2">Something went wrong</h2>
                <p className="text-sm text-[#8A8A90] mb-4">An unexpected error occurred.</p>
                <button
                    onClick={reset}
                    className="px-4 py-2 bg-[#8B5CF6] text-white rounded-lg text-sm hover:bg-[#A78BFA] transition-colors"
                >
                    Try again
                </button>
            </div>
        </div>
    );
}
