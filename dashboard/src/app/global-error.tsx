"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <head>
        <title>Critical Error</title>
      </head>
      <body className="bg-slate-50 min-h-screen flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Something went wrong</h2>
          <p className="text-sm text-slate-500 mb-6">An unexpected error occurred.</p>
          <button
            onClick={() => reset()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
