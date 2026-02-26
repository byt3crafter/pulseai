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
      <body>
        <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
          <h2>Something went wrong</h2>
          <p>An unexpected error occurred.</p>
          <button onClick={() => reset()}>Try again</button>
        </div>
      </body>
    </html>
  );
}
