"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDate, jobBoardLabel, statusBadgeClass, statusLabel, timeAgo } from "@/app/lib/format";
import type { Application, Status } from "@/app/lib/types";

type Meta = { next_cursor: string | null; has_more: boolean };

type Filters = { status: Status | null; company: string | null; source: string | null };

const STATUS_PRIORITY: Record<Status, number> = {
  phone_screen: 0,
  technical: 0,
  final_round: 0,
  offer: 0,
  accepted: 1,
  applied: 1,
  draft: 1,
  wishlist: 2,
  declined: 2,
  rejected: 2,
  withdrawn: 2,
  ghosted: 3,
  archived: 3,
};

function sortByImportance(apps: Application[]): Application[] {
  return [...apps].sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]);
}

const NO_FILTERS: Filters = { status: null, company: null, source: null };

interface Props {
  initialItems: Application[];
  initialMeta: Meta;
  statusBuckets: [Status, number][];
  facets: [string, string][]; // [company, board-host] per application
  total: number;
}

export function ApplicationsList({
  initialItems,
  initialMeta,
  statusBuckets,
  facets,
  total,
}: Props) {
  const [items, setItems] = useState(() => sortByImportance(initialItems));
  const [meta, setMeta] = useState(initialMeta);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [loading, setLoading] = useState(false);

  async function fetchPage(f: Filters, after?: string) {
    const qs = new URLSearchParams({ limit: "10" });
    if (after) qs.set("after", after);
    if (f.status) qs.set("status", f.status);
    if (f.company) qs.set("company", f.company);
    if (f.source) qs.set("source", f.source);
    const res = await fetch(`/api/applications?${qs}`);
    if (!res.ok) return null;
    return (await res.json()) as { data: Application[]; meta: Meta };
  }

  async function applyFilters(next: Filters) {
    if (loading) return;
    setLoading(true);
    try {
      const body = await fetchPage(next);
      if (!body) return;
      setFilters(next);
      setItems(sortByImportance(body.data));
      setMeta(body.meta);
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!meta.next_cursor || loading) return;
    setLoading(true);
    try {
      const body = await fetchPage(filters, meta.next_cursor);
      if (!body) return;
      setItems((prev) => sortByImportance([...prev, ...body.data]));
      setMeta(body.meta);
    } finally {
      setLoading(false);
    }
  }

  const hasActiveFilter = filters.status !== null || filters.company !== null || filters.source !== null;

  // Each dropdown's options reflect the OTHER active filter, so picking a board
  // narrows the company list and vice versa; counts reflect the narrowed set.
  function buckets(pick: "company" | "board", constrainTo: string | null): [string, number][] {
    const counts = new Map<string, number>();
    for (const [company, board] of facets) {
      if (constrainTo && (pick === "company" ? board : company) !== constrainTo) continue;
      const key = pick === "company" ? company : board;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }

  const companyOptions = buckets("company", filters.source);
  const boardOptions = buckets("board", filters.company);

  // When a change makes the other selection impossible (no app has both), drop
  // it so the dropdown value can never point at an option that isn't shown.
  function changeCompany(company: string | null) {
    let { source } = filters;
    if (company && source && !facets.some(([c, s]) => c === company && s === source)) source = null;
    applyFilters({ ...filters, company, source });
  }

  function changeSource(source: string | null) {
    let { company } = filters;
    if (source && company && !facets.some(([c, s]) => c === company && s === source)) company = null;
    applyFilters({ ...filters, company, source });
  }

  return (
    <div className="space-y-4">
      {facets.length > 0 && (
        <div className="flex flex-wrap items-end gap-3">
          <FilterSelect
            label="Company"
            value={filters.company ?? ""}
            disabled={loading}
            allLabel="All companies"
            options={companyOptions.map(([name, count]) => ({ value: name, label: name, count }))}
            onChange={(value) => changeCompany(value || null)}
          />
          <FilterSelect
            label="Job board"
            value={filters.source ?? ""}
            disabled={loading}
            allLabel="All boards"
            options={boardOptions.map(([host, count]) => ({
              value: host,
              label: jobBoardLabel(host),
              count,
            }))}
            onChange={(value) => changeSource(value || null)}
          />
          {hasActiveFilter && (
            <button
              onClick={() => applyFilters(NO_FILTERS)}
              disabled={loading}
              className="px-2 py-1.5 text-xs text-ink-soft underline underline-offset-4 transition hover:text-midnight disabled:opacity-50"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {statusBuckets.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => applyFilters({ ...filters, status: null })}
            disabled={loading}
            className={`inline-flex items-center gap-2 px-3 py-1 text-xs font-medium ring-1 ring-inset ring-midnight/20 transition disabled:cursor-wait ${filters.status === null ? "bg-sand text-midnight" : "bg-sand/40 text-ink-soft hover:text-midnight"
              }`}
          >
            All <span className="font-mono">{total}</span>
          </button>
          {statusBuckets.map(([status, count]) => (
            <button
              key={status}
              onClick={() => applyFilters({ ...filters, status })}
              disabled={loading}
              className={`inline-flex items-center gap-2 px-3 py-1 text-xs font-medium ring-1 ring-inset transition disabled:cursor-wait ${statusBadgeClass(status)} ${filters.status === status ? "" : "opacity-40 hover:opacity-70"
                }`}
            >
              {statusLabel(status)} <span className="font-mono">{count}</span>
            </button>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <div className="border border-dashed border-dune bg-linen p-12 text-center">
          {hasActiveFilter ? (
            <p className="text-ink-soft">No applications match these filters.</p>
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

type Option = { value: string; label: string; count: number };

function FilterSelect({
  label,
  value,
  options,
  allLabel,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  allLabel: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="kk-label">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 block min-w-44 border border-dune bg-linen px-3 py-1.5 text-sm text-midnight focus:border-cobalt focus:outline-none focus:ring-1 focus:ring-cobalt disabled:opacity-50"
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label} ({o.count})
          </option>
        ))}
      </select>
    </label>
  );
}
