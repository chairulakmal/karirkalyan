import Link from "next/link";
import { apiFetch } from "@/app/lib/api";
import { formatDate, statusBadgeClass, statusLabel, timeAgo } from "@/app/lib/format";
import type { Application, DashboardStats } from "@/app/lib/types";

export default async function Dashboard() {
  const [appsRes, statsRes] = await Promise.all([
    apiFetch<Application[]>("/applications"),
    apiFetch<DashboardStats>("/dashboard"),
  ]);

  if (!appsRes.ok) {
    return <ErrorBlock message={appsRes.error} />;
  }
  const applications = appsRes.data;
  const stats = statsRes.ok ? statsRes.data : null;

  return (
    <div className="space-y-10">
      <header className="flex items-end justify-between border-b border-dune pb-6">
        <div>
          <p className="kk-label">Overview</p>
          <h1 className="mt-1 text-3xl">Dashboard</h1>
          <p className="mt-1 font-mono text-xs text-ink-soft">
            {stats?.total ?? applications.length} applications tracked
          </p>
        </div>
        <Link
          href="/applications/new"
          className="bg-cobalt px-4 py-2 text-sm font-medium text-linen transition hover:bg-cobalt-2"
        >
          New application
        </Link>
      </header>

      {stats ? <Stats stats={stats} /> : null}

      {applications.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="divide-y divide-dune border border-dune bg-linen">
          {applications.map((app) => (
            <li key={app.id}>
              <Link
                href={`/applications/${app.id}`}
                className="flex items-center justify-between gap-6 px-5 py-4 transition hover:bg-sand/60"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-3">
                    <p className="truncate font-serif text-lg font-medium text-midnight">
                      {app.company}
                    </p>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusBadgeClass(app.status)}`}
                    >
                      {statusLabel(app.status)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm text-ink-soft">{app.role}</p>
                </div>
                <div className="hidden text-right font-mono text-xs text-ink-soft sm:block">
                  {app.applied_at ? (
                    <p>Applied {timeAgo(app.applied_at)}</p>
                  ) : (
                    <p>Created {timeAgo(app.created_at)}</p>
                  )}
                  {app.follow_up_at ? (
                    <p className="mt-0.5 font-medium text-saffron">
                      Follow up {formatDate(app.follow_up_at)}
                    </p>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stats({ stats }: { stats: DashboardStats }) {
  const buckets = Object.entries(stats.by_status);
  if (buckets.length === 0) return null;
  return (
    <section className="border border-dune bg-linen p-5">
      <p className="kk-label">By status</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {buckets.map(([status, count]) => (
          <li
            key={status}
            className={`inline-flex items-center gap-2 px-3 py-1 text-xs font-medium ring-1 ring-inset ${statusBadgeClass(status as never)}`}
          >
            {statusLabel(status as never)}
            <span className="font-mono">{count}</span>
          </li>
        ))}
      </ul>
      {stats.avg_days_to_offer !== null ? (
        <p className="mt-4 font-mono text-xs text-ink-soft">
          Average days from apply → offer:{" "}
          <span className="text-midnight">{stats.avg_days_to_offer}</span>
        </p>
      ) : null}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="border border-dashed border-dune bg-linen p-12 text-center">
      <p className="text-ink-soft">No applications yet.</p>
      <Link
        href="/applications/new"
        className="mt-3 inline-block text-sm font-medium text-cobalt underline underline-offset-4 hover:text-cobalt-2"
      >
        Add your first one →
      </Link>
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
