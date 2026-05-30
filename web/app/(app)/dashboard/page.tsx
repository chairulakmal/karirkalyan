import Link from "next/link";
import { apiFetch } from "@/app/lib/api";
import type { Application, DashboardStats, Status } from "@/app/lib/types";
import { ApplicationsList } from "./applications-list";

export default async function Dashboard() {
  const [appsRes, statsRes] = await Promise.all([
    apiFetch<{ data: Application[]; meta: { next_cursor: string | null; has_more: boolean } }>(
      "/applications?limit=10",
    ),
    apiFetch<DashboardStats>("/dashboard"),
  ]);

  if (!appsRes.ok) {
    return <ErrorBlock message={appsRes.error} />;
  }

  const { data: applications, meta } = appsRes.data;
  const stats = statsRes.ok ? statsRes.data : null;
  const statusBuckets = stats ? (Object.entries(stats.by_status) as [Status, number][]) : [];
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

      {stats?.avg_days_to_offer != null && (
        <p className="font-mono text-xs text-ink-soft">
          Average days from apply → offer:{" "}
          <span className="text-midnight">{stats.avg_days_to_offer}</span>
        </p>
      )}

      <ApplicationsList
        initialItems={applications}
        initialMeta={meta}
        statusBuckets={statusBuckets}
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
