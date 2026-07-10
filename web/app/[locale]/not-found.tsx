// Locale-aware Link: a 404 inside /ja must send the visitor to /ja/dashboard.
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
      <p className="kk-label">404</p>
      <h1 className="mt-2 text-3xl">Page not found</h1>
      <p className="mt-3 text-sm text-ink-soft">
        That page does not exist or may have been removed.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-block bg-cobalt px-4 py-2 text-sm font-medium text-linen transition hover:bg-cobalt-2"
      >
        Back to dashboard
      </Link>
    </main>
  );
}
