"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  formatDate,
  isOverdue,
  jobBoardLabel,
  statusBadgeClass,
  timeAgo,
} from "@/app/lib/format";
import type { Application, PageMeta, Status } from "@/app/lib/types";

// `statuses` is a subset of the *rendered* chips, held in chip order. Baymard:
// values within one filter type OR together, and still AND against company /
// source — which is what a list means to the server.
type Filters = { statuses: Status[]; company: string | null; source: string | null };

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

// Surfaces active applications first *within a single page*. We deliberately do
// NOT re-sort across pages: the API paginates by its own cursor order, so
// re-sorting the accumulated list would interleave freshly loaded items into
// the middle of already-seen ones. Applied to the first page (and each filtered
// reload, which is itself a first page); appended pages keep server order.
function sortByImportance(apps: Application[]): Application[] {
  return [...apps].sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]);
}

interface Props {
  initialItems: Application[];
  initialMeta: PageMeta;
  // Only statuses that have rows — this is `group(:status).count`, so the chip
  // row is however many stages the user has actually used, not all thirteen.
  statusBuckets: [Status, number][];
  // ApplicationFSM::ACTIVE_STATES, fetched from /transitions. Empty when that
  // fetch failed, which drops the "Active" preset.
  activeStates: Status[];
  facets: [string, string][]; // [company, board-host] per application
  total: number;
  // Every at-risk id, not just the ones on the first page — the ghost-risk query
  // is not paginated, so rows appended by "load more" get the marker too.
  atRiskIds: number[];
}

export function ApplicationsList({
  initialItems,
  initialMeta,
  statusBuckets,
  activeStates,
  facets,
  total,
  atRiskIds,
}: Props) {
  const t = useTranslations("list");
  const ts = useTranslations("status");
  const tg = useTranslations("dashboard.ghostRisk");
  const locale = useLocale();
  const atRisk = new Set(atRiskIds);
  const rendered = statusBuckets.map(([status]) => status);
  const [items, setItems] = useState(() => sortByImportance(initialItems));
  const [meta, setMeta] = useState(initialMeta);
  // Every chip starts lit: the user subtracts stages from a closed set they
  // already have a mental model of, rather than opting in one at a time. The
  // list still first appears unfiltered — all of them selected *is* unfiltered.
  const [filters, setFilters] = useState<Filters>(() => ({
    statuses: rendered,
    company: null,
    source: null,
  }));
  const [loading, setLoading] = useState(false);

  const allStages = filters.statuses.length === rendered.length;
  // Zero chips is a UI state, not a query — see applyFilters. An account with no
  // applications renders no chips either, and that is `empty`, not hidden.
  const noStages = rendered.length > 0 && filters.statuses.length === 0;
  const activeRendered = rendered.filter((s) => activeStates.includes(s));

  async function fetchPage(f: Filters, after?: string) {
    const qs = new URLSearchParams({ limit: "10" });
    if (after) qs.set("after", after);
    // Every rendered chip lit is the unfiltered list, so send nothing at all —
    // byte-identical to the request this list has always made for "All".
    if (f.statuses.length < rendered.length) qs.set("status", f.statuses.join(","));
    if (f.company) qs.set("company", f.company);
    if (f.source) qs.set("source", f.source);
    const res = await fetch(`/api/applications?${qs}`);
    if (!res.ok) return null;
    return (await res.json()) as { data: Application[]; meta: PageMeta };
  }

  async function applyFilters(next: Filters) {
    if (loading) return;
    // "Show nothing" is not a query the server can be asked: an empty status
    // list reads as unfiltered there (`where(status: [])` would match zero rows
    // silently, so ListQuery deliberately ignores it), and asking would hand
    // back everything. Hold it client-side and render the reason instead.
    if (next.statuses.length === 0) {
      setFilters(next);
      return;
    }
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

  function toggleStatus(status: Status) {
    const statuses = filters.statuses.includes(status)
      ? filters.statuses.filter((s) => s !== status)
      : // Rebuilt from `rendered` rather than appended, so the selection keeps
        // chip order and the query string does not depend on click order.
        rendered.filter((s) => filters.statuses.includes(s) || s === status);
    applyFilters({ ...filters, statuses });
  }

  async function loadMore() {
    if (!meta.next_cursor || loading) return;
    setLoading(true);
    try {
      const body = await fetchPage(filters, meta.next_cursor);
      if (!body) return;
      // Append in server (cursor) order — do not re-sort the accumulated list.
      setItems((prev) => [...prev, ...body.data]);
      setMeta(body.meta);
    } finally {
      setLoading(false);
    }
  }

  const hasActiveFilter = !allStages || filters.company !== null || filters.source !== null;
  const noFilters: Filters = { statuses: rendered, company: null, source: null };

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
            label={t("company")}
            value={filters.company ?? ""}
            disabled={loading}
            allLabel={t("allCompanies")}
            options={companyOptions.map(([name, count]) => ({ value: name, label: name, count }))}
            onChange={(value) => changeCompany(value || null)}
          />
          <FilterSelect
            label={t("jobBoard")}
            value={filters.source ?? ""}
            disabled={loading}
            allLabel={t("allBoards")}
            options={boardOptions.map(([host, count]) => ({
              value: host,
              label: jobBoardLabel(host, t("noBoard")),
              count,
            }))}
            onChange={(value) => changeSource(value || null)}
          />
          {hasActiveFilter && (
            <button
              onClick={() => applyFilters(noFilters)}
              disabled={loading}
              className="px-2 py-1.5 text-xs text-ink-soft underline underline-offset-4 transition hover:text-midnight disabled:opacity-50"
            >
              {t("clearFilters")}
            </button>
          )}
        </div>
      )}

      {statusBuckets.length > 0 && (
        // A <fieldset> with a <legend>, per GOV.UK: the chips are independent
        // checkboxes, and the legend is what names the group they belong to.
        //
        // Deliberately not `disabled` while a page is in flight: that reaches
        // every control inside — including the checkbox the user just toggled,
        // and a disabled element cannot hold focus, so every toggle would drop
        // the caret to <body> and cost a keyboard user a full tab back. Block
        // the handler, not the control: applyFilters already early-returns on
        // `loading`, so a second click is a no-op with focus intact.
        <fieldset
          aria-busy={loading}
          className={`border-0 p-0 transition ${loading ? "opacity-60" : ""}`}
        >
          <legend className="kk-label">{t("stages")}</legend>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {/* Shortcuts to a chip selection, and visibly nothing more: after a
                click the lit chips say what was selected, and any one of them
                can still be toggled back off. Never a status=active macro on
                the wire — the param takes states, and a group that parsed in the
                same slot would make it mean two things. */}
            <div role="group" aria-label={t("stagePresets")} className="flex flex-wrap gap-2">
              {/* Stages only — company and source are a different filter type and
                  survive. "Clear filters" is the control that resets everything,
                  and a preset inside this fieldset silently doing its job too
                  would drop a company the user never asked to lose. */}
              <Preset
                label={t("all")}
                count={total}
                onClick={() => applyFilters({ ...filters, statuses: rendered })}
              />
              {activeRendered.length > 0 && (
                <Preset
                  label={t("activeStages")}
                  count={statusBuckets.reduce(
                    (n, [status, count]) => (activeStates.includes(status) ? n + count : n),
                    0,
                  )}
                  onClick={() => applyFilters({ ...filters, statuses: activeRendered })}
                />
              )}
              <Preset label={t("noStages")} onClick={() => applyFilters({ ...filters, statuses: [] })} />
            </div>

            {statusBuckets.map(([status, count]) => {
              const on = filters.statuses.includes(status);
              return (
                <label
                  key={status}
                  title={ts(`description.${status}`)}
                  // Selection is carried by the checkbox — a real one, so the
                  // mark is structural rather than a dimmed brand colour, which
                  // would be colour alone (WCAG 1.4.1) and drag the label toward
                  // failing contrast besides. Dropping the status tint when
                  // unselected is a redundant scan aid on a thirteen-wide row,
                  // not the signal.
                  className={`inline-flex min-h-10 cursor-pointer items-center gap-2 px-3 py-1 text-xs font-medium ring-1 ring-inset transition ${on ? statusBadgeClass(status) : "bg-sand/40 text-ink-soft ring-midnight/20 hover:text-midnight"
                    }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleStatus(status)}
                    className="size-3.5 accent-current"
                  />
                  {ts(`label.${status}`)} <span className="font-mono">{count}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {/* Toggling a chip rewrites the list below without moving focus, so a
          screen reader would otherwise get no signal that anything happened.
          Polite, not assertive: it is a result of the user's own action, and
          should wait for them to stop typing/clicking rather than cut in. */}
      <p aria-live="polite" className="sr-only">
        {noStages ? t("allStagesHidden") : t("resultCount", { count: items.length })}
      </p>

      {noStages ? (
        // Not `noMatches`: nothing failed to match, the user hid it. A blank
        // panel here would read as the system being broken, so say which.
        <div className="border border-dashed border-dune bg-linen p-12 text-center">
          <p className="text-ink-soft">{t("allStagesHidden")}</p>
          <button
            onClick={() => applyFilters({ ...filters, statuses: rendered })}
            className="mt-3 inline-block text-sm font-medium text-cobalt underline underline-offset-4 hover:text-cobalt-2"
          >
            {t("showAllStages")}
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="border border-dashed border-dune bg-linen p-12 text-center">
          {hasActiveFilter ? (
            <p className="text-ink-soft">{t("noMatches")}</p>
          ) : (
            <>
              <p className="text-ink-soft">{t("empty")}</p>
              <Link
                href="/applications/new"
                className="mt-3 inline-block text-sm font-medium text-cobalt underline underline-offset-4 hover:text-cobalt-2"
              >
                {t("addFirst")}
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
                      title={ts(`description.${app.status}`)}
                      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusBadgeClass(app.status)}`}
                    >
                      {ts(`label.${app.status}`)}
                    </span>
                    {atRisk.has(app.id) && (
                      <span
                        title={tg("markerTitle")}
                        className="inline-flex items-center px-2 py-0.5 text-xs font-medium text-danger ring-1 ring-inset ring-danger/30"
                      >
                        {tg("marker")}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-sm text-ink-soft">{app.role}</p>
                </div>
                <div className="hidden text-right font-mono text-xs text-ink-soft sm:block">
                  {app.applied_at ? (
                    <p>{t("appliedAgo", { ago: timeAgo(app.applied_at, locale) })}</p>
                  ) : (
                    <p>{t("createdAgo", { ago: timeAgo(app.created_at, locale) })}</p>
                  )}
                  {app.follow_up_at ? (
                    // Overdue only shouts on applications still in play — a
                    // stale date on a rejected/closed one isn't actionable.
                    activeStates.includes(app.status) && isOverdue(app.follow_up_at) ? (
                      <p className="mt-0.5 font-medium text-danger">
                        {t("followUpOverdue", { date: formatDate(app.follow_up_at, locale) })}
                      </p>
                    ) : (
                      <p className="mt-0.5 font-medium text-saffron">
                        {t("followUp", { date: formatDate(app.follow_up_at, locale) })}
                      </p>
                    )
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* `meta` is whatever the last fetch left behind, and hiding every stage
          does not fetch — so it can still claim another page of a list that is
          not on screen. */}
      {!noStages && meta.has_more && (
        <div className="text-center">
          <button
            onClick={loadMore}
            disabled={loading}
            className="border border-dune px-6 py-2 text-sm font-medium text-midnight transition hover:bg-dune disabled:opacity-50"
          >
            {loading ? t("loading") : t("loadMore")}
          </button>
        </div>
      )}
    </div>
  );
}

function Preset({
  label,
  count,
  onClick,
}: {
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-10 items-center gap-2 border border-dune bg-linen px-3 py-1 text-xs font-medium text-ink-soft transition hover:bg-sand hover:text-midnight disabled:cursor-wait disabled:opacity-50"
    >
      {label}
      {count !== undefined && <span className="font-mono">{count}</span>}
    </button>
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
  const t = useTranslations("list");
  return (
    <label className="block text-sm">
      <span className="kk-label">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 block min-w-44 border border-dune bg-linen px-3 py-1.5 text-sm text-midnight disabled:opacity-50"
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {t("option", { label: o.label, count: o.count })}
          </option>
        ))}
      </select>
    </label>
  );
}
