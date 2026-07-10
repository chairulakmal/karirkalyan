"use client";

// Route-level error boundary — catches thrown errors from server components
// (e.g. the Rails API being unreachable) that aren't handled as ApiResult.
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
      <p className="kk-label">Error</p>
      <h1 className="mt-2 text-3xl">Something went wrong</h1>
      <p className="mt-3 text-sm text-ink-soft">
        The page failed to load — possibly a temporary network problem. Try
        again in a moment.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 bg-cobalt px-4 py-2 text-sm font-medium text-linen transition hover:bg-cobalt-2"
      >
        Try again
      </button>
    </main>
  );
}
