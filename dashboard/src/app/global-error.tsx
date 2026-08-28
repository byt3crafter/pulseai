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
      <body className="flex min-h-screen items-center justify-center bg-pulse-bg p-8">
        <div className="text-center max-w-sm">
          <h2 className="mb-2 text-[20px] font-semibold text-pulse-text">Something went wrong</h2>
          <p className="mb-6 text-[13px] text-pulse-muted">An unexpected error occurred.</p>
          <button
            onClick={() => reset()}
            className="cursor-pointer rounded-lg bg-pulse-accent px-4 py-2 text-[13.5px] font-medium text-white transition-colors hover:bg-pulse-accent-hi"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
