"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDate, statusBadgeClass, statusLabel, timeAgo } from "@/app/lib/format";
import type { Application, Status } from "@/app/lib/types";

type Meta = { next_cursor: string | null; has_more: boolean };

interface Props {
  initialItems: Application[];
  initialMeta: Meta;
  statusBuckets: [Status, number][];
  total: number;
}

export function ApplicationsList({ initialItems, initialMeta, statusBuckets, total }: Props) {
  const [items, setItems] = useState(initialItems);
  const [meta, setMeta] = useState(initialMeta);
  const [activeStatus, setActiveStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);

  async function fetchPage(status: Status | null, after?: string) {
    const qs = new URLSearchParams({ limit: "10" });
    if (after) qs.set("after", after);
    if (status) qs.set("status", status);
    const res = await fetch(`/api/applications?${qs}`);
    if (!res.ok) return null;
    return (await res.json()) as { data: Application[]; meta: Meta };
  }

  async function handleFilter(status: Status | null) {
    if (status === activeStatus || loading) return;
    setLoading(true);
    try {
      const body = await fetchPage(status);
      if (!body) return;
      setActiveStatus(status);
      setItems(body.data);
      setMeta(body.meta);
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!meta.next_cursor || loading) return;
    setLoading(true);
    try {
      const body = await fetchPage(activeStatus, meta.next_cursor);
      if (!body) return;
      setItems((prev) => [...prev, ...body.data]);
      setMeta(body.meta);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {statusBuckets.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleFilter(null)}
            disabled={loading}
            className={`inline-flex items-center gap-2 px-3 py-1 text-xs font-medium ring-1 ring-inset ring-midnight/20 transition disabled:cursor-wait ${
              activeStatus === null ? "bg-sand text-midnight" : "bg-sand/40 text-ink-soft hover:text-midnight"
            }`}
          >
            All <span className="font-mono">{total}</span>
          </button>
          {statusBuckets.map(([status, count]) => (
            <button
              key={status}
              onClick={() => handleFilter(status)}
              disabled={loading}
              className={`inline-flex items-center gap-2 px-3 py-1 text-xs font-medium ring-1 ring-inset transition disabled:cursor-wait ${statusBadgeClass(status)} ${
                activeStatus === status ? "" : "opacity-40 hover:opacity-70"
              }`}
            >
              {statusLabel(status)} <span className="font-mono">{count}</span>
            </button>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <div className="border border-dashed border-dune bg-linen p-12 text-center">
          {activeStatus ? (
            <p className="text-ink-soft">
              No <span className="font-medium">{statusLabel(activeStatus)}</span> applications.
            </p>
          ) : (
            <>
              <p className="text-ink-soft">No applications yet.</p>
              <Link
                href="/applications/new"
                className="mt-3 inline-block text-sm font-medium text-cobalt underline underline-offset-4 hover:text-cobalt-2"
              >
                Add your first one →
              </Link>
            </>
          )}
        </div>
      ) : (
        <ul className={`divide-y divide-dune border border-dune bg-linen transition-opacity ${loading ? "opacity-50" : ""}`}>
          {items.map((app) => (
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

      {meta.has_more && (
        <div className="text-center">
          <button
            onClick={loadMore}
            disabled={loading}
            className="border border-dune px-6 py-2 text-sm font-medium text-midnight transition hover:bg-dune disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
