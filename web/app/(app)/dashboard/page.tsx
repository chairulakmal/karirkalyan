import Link from "next/link";
import { apiFetch } from "@/app/lib/api";
import type { Application, DashboardStats, Status, User } from "@/app/lib/types";
import { ApplicationsList } from "./applications-list";

export default async function Dashboard() {
  const [appsRes, statsRes, meRes] = await Promise.all([
    apiFetch<{ data: Application[]; meta: { next_cursor: string | null; has_more: boolean } }>(
      "/applications?limit=10",
    ),
    apiFetch<DashboardStats>("/dashboard"),
    apiFetch<User>("/me"),
  ]);

  if (!appsRes.ok) {
    return <ErrorBlock message={appsRes.error} />;
  }

  const { data: applications, meta } = appsRes.data;
  const stats = statsRes.ok ? statsRes.data : null;
  const me = meRes.ok ? meRes.data : null;
  const statusBuckets = stats ? (Object.entries(stats.by_status) as [Status, number][]) : [];
  const facets = stats?.facets ?? [];
  const total = stats?.total ?? applications.length;

  return (
    <div className="space-y-10">
      <header className="flex items-end justify-between border-b border-dune pb-6">
        <div>
          <p className="kk-label">Overview</p>
          <h1 className="mt-1 text-3xl">Dashboard</h1>
          <p className="mt-1 font-mono text-xs text-ink-soft">{total} applications tracked</p>
        </div>
        <Link
          href="/applications/new"
          className="bg-cobalt px-4 py-2 text-sm font-medium text-linen transition hover:bg-cobalt-2"
        >
          New application
        </Link>
      </header>

      {me && (
        <section className="border border-dune bg-linen p-5">
          <p className="kk-label">Profile</p>
          <dl className="mt-3 flex flex-wrap gap-x-10 gap-y-2 text-sm">
            <div>
              <dt className="font-mono text-xs text-ink-soft">Email</dt>
              <dd className="mt-0.5 text-midnight">{me.email}</dd>
            </div>
            <div>
              <dt className="font-mono text-xs text-ink-soft">Member since</dt>
              <dd className="mt-0.5 text-midnight">
                {new Date(me.created_at).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {stats?.avg_days_to_offer != null && (
        <p className="font-mono text-xs text-ink-soft">
          Average days from apply → offer:{" "}
          <span className="text-midnight">{stats.avg_days_to_offer}</span>
          <span className="group relative ml-2 inline-block align-middle">
            <span className="cursor-help select-none text-ink-soft/50 hover:text-ink-soft">ⓘ</span>
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 rounded bg-midnight px-3 py-2 font-sans leading-relaxed text-linen opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              Counts applications that reached offer, accepted, or declined. Measured from your
              applied date to when the offer status was recorded in the audit log.
            </span>
          </span>
        </p>
      )}

      <ApplicationsList
        initialItems={applications}
        initialMeta={meta}
        statusBuckets={statusBuckets}
        facets={facets}
        total={total}
      />
    </div>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="border border-red-300 bg-red-50 p-5 text-sm text-red-800">
      Failed to load: {message}
    </div>
  );
}
