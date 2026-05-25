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
    <div className="space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-zinc-500">{stats?.total ?? applications.length} applications</p>
        </div>
        <Link
          href="/applications/new"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-700"
        >
          New application
        </Link>
      </header>

      {stats ? <Stats stats={stats} /> : null}

      {applications.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
          {applications.map((app) => (
            <li key={app.id}>
              <Link
                href={`/applications/${app.id}`}
                className="flex items-center justify-between gap-6 px-5 py-4 hover:bg-zinc-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-3">
                    <p className="truncate font-medium text-zinc-900">{app.company}</p>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusBadgeClass(app.status)}`}
                    >
                      {statusLabel(app.status)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm text-zinc-600">{app.role}</p>
                </div>
                <div className="hidden text-right text-xs text-zinc-500 sm:block">
                  {app.applied_at ? (
                    <p>Applied {timeAgo(app.applied_at)}</p>
                  ) : (
                    <p>Created {timeAgo(app.created_at)}</p>
                  )}
                  {app.follow_up_at ? (
                    <p className="mt-0.5 font-medium text-amber-700">
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
    <section className="rounded-lg border border-zinc-200 bg-white p-5">
      <h2 className="text-sm font-medium text-zinc-700">By status</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {buckets.map(([status, count]) => (
          <li
            key={status}
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${statusBadgeClass(status as never)}`}
          >
            {statusLabel(status as never)}
            <span className="font-mono">{count}</span>
          </li>
        ))}
      </ul>
      {stats.avg_days_to_offer !== null ? (
        <p className="mt-3 text-xs text-zinc-500">
          Average days from apply → offer: <span className="font-mono">{stats.avg_days_to_offer}</span>
        </p>
      ) : null}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center">
      <p className="text-zinc-600">No applications yet.</p>
      <Link
        href="/applications/new"
        className="mt-3 inline-block text-sm font-medium text-zinc-900 underline underline-offset-4"
      >
        Add your first one →
      </Link>
    </div>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-rose-300 bg-rose-50 p-5 text-sm text-rose-800">
      Failed to load: {message}
    </div>
  );
}
