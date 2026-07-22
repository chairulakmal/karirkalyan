"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import {
  formatDate,
  isOverdue,
  jobBoardLabel,
  statusBadgeClass,
  timeAgo,
} from "@/app/lib/format";
import type { Application, JapaneseLevel, PageMeta, Status } from "@/app/lib/types";
import { JAPANESE_LEVELS } from "@/app/lib/types";

// `statuses` is a subset of the *rendered* chips, held in chip order. Baymard:
// values within one filter type OR together, and still AND against company /
// source — which is what a list means to the server.
type Filters = {
  statuses: Status[];
  company: string | null;
  source: string | null;
  japaneseLevel: JapaneseLevel | null;
  // Free-text search (v1.11.0): a `q` param the server ILIKEs over company/role/
  // notes. Null when empty; ANDs against the structured filters like the rest.
  q: string | null;
};

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

// archived never appears on the dashboard (SPEC.md § Dashboard). The server is
// already asked only for non-archived stages, but drop any archived row
// defensively so nothing leaks even in the /transitions-failed fallback where
// the default degrades to the server's unfiltered set.
const notArchived = (a: Application) => a.status !== "archived";

// Two stage selections are the same view when they hold the same statuses,
// regardless of order. Used to tell the default (active) view from the rest.
const sameStages = (a: Status[], b: Status[]) =>
  a.length === b.length && a.every((s) => b.includes(s));

interface Props {
  initialItems: Application[];
  initialMeta: PageMeta;
  // Only statuses that have rows — this is `group(:status).count`, so the chip
  // row is however many stages the user has actually used, not all thirteen.
  statusBuckets: [Status, number][];
  // ApplicationFSM::ACTIVE_STATES, fetched from /transitions. Empty when that
  // fetch failed, which drops the "Active" preset.
  activeStates: Status[];
  // [company, board-host, status, japanese_level] per application (v1.10.0), the
  // source for every filter's counts, cross-narrowing disjunctively.
  facets: [string, string, Status, JapaneseLevel | null][];
  // Every at-risk id, not just the ones on the first page — the ghost-risk query
  // is not paginated, so rows appended by "load more" get the marker too.
  atRiskIds: number[];
  // The filters the URL arrived with (v1.10.0), already used server-side for the
  // first paint. Raw strings; the client validates them against what it renders,
  // so junk degrades to unfiltered here the same way ListQuery ignores it there.
  initialFilters: {
    status: string | null;
    company: string | null;
    source: string | null;
    japaneseLevel: string | null;
    q: string | null;
  };
}

export function ApplicationsList({
  initialItems,
  initialMeta,
  statusBuckets,
  activeStates,
  facets,
  atRiskIds,
  initialFilters,
}: Props) {
  const t = useTranslations("list");
  const ts = useTranslations("status");
  const tg = useTranslations("dashboard.ghostRisk");
  const tl = useTranslations("japaneseLevel");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const atRisk = new Set(atRiskIds);
  const rendered = statusBuckets.map(([status]) => status);
  // The dashboard's default view and the "Active" preset are the same set: the
  // in-play stages that actually have rows. Empty when /transitions failed (no
  // active set known), so the default falls back to the full non-archived row
  // rather than to nothing.
  const activeRendered = rendered.filter((s) => activeStates.includes(s));
  const defaultStages = activeRendered.length > 0 ? activeRendered : rendered;
  const [items, setItems] = useState(() => sortByImportance(initialItems.filter(notArchived)));
  const [meta, setMeta] = useState(initialMeta);
  // The chips start on the active stages, the dashboard's default view (SPEC.md
  // § Dashboard): the user narrows or expands from what's in play rather than
  // from the full row. Seeded from the URL the page arrived with, validated
  // against what this list actually renders: an absent status param is the active
  // default, and a status param whose members are all junk intersects to nothing
  // and so also falls back to the default, matching how the server first-painted.
  const [filters, setFilters] = useState<Filters>(() => {
    const wanted = initialFilters.status?.split(",").map((s) => s.trim());
    const fromUrl = wanted ? rendered.filter((s) => wanted.includes(s)) : [];
    const jlpt = initialFilters.japaneseLevel;
    return {
      statuses: fromUrl.length > 0 ? fromUrl : defaultStages,
      company: initialFilters.company || null,
      source: initialFilters.source || null,
      japaneseLevel: jlpt && (JAPANESE_LEVELS as readonly string[]).includes(jlpt)
        ? (jlpt as JapaneseLevel)
        : null,
      q: initialFilters.q || null,
    };
  });
  const [loading, setLoading] = useState(false);
  // The search box's live text, separate from the applied `filters.q`: it filters
  // on Enter (submit), and clearing it to empty applies immediately so the "x"
  // works. Seeded from the URL so a shared ?q= view shows its term.
  const [qInput, setQInput] = useState(initialFilters.q ?? "");
  // The closed-stage chips collapse behind a disclosure (v1.11.0); see the split
  // derived below. Starts collapsed; a selected closed chip forces it open.
  const [showClosed, setShowClosed] = useState(false);

  // Mirror the applied filters into the URL so a filtered view is linkable,
  // reload-survivable, and back-button-correct. `replace`, not `push`: filtering
  // is refining one view, not navigating, so it should not stack history. The
  // default (active) view keeps a bare URL; every other stage selection is
  // encoded, "All" (the full non-archived row) included, so it is shareable and
  // survives reload. The zero-chip "show nothing" transient also stays bare and
  // reads as the default on reload. Routed through i18n/navigation so the locale
  // prefix is preserved.
  function syncUrl(f: Filters) {
    const qs = new URLSearchParams();
    if (f.statuses.length > 0 && !sameStages(f.statuses, defaultStages)) {
      qs.set("status", f.statuses.join(","));
    }
    if (f.company) qs.set("company", f.company);
    if (f.source) qs.set("source", f.source);
    if (f.japaneseLevel) qs.set("japanese_level", f.japaneseLevel);
    if (f.q) qs.set("q", f.q);
    const query = qs.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  // The default (active) view reads as unfiltered: no "Clear filters", bare URL.
  const isDefaultStages = sameStages(filters.statuses, defaultStages);
  // Zero chips is a UI state, not a query — see applyFilters. An account with no
  // applications renders no chips either, and that is `empty`, not hidden.
  const noStages = rendered.length > 0 && filters.statuses.length === 0;

  async function fetchPage(f: Filters, after?: string) {
    const qs = new URLSearchParams({ limit: "10" });
    if (after) qs.set("after", after);
    // Always send the stages explicitly. "All" here is the non-archived row,
    // which is NOT the server's unfiltered set (that includes archived), so the
    // old "send nothing when every chip is lit" shortcut would leak archived onto
    // the dashboard. applyFilters early-returns on zero chips, so `f.statuses` is
    // never the empty list here.
    if (f.statuses.length > 0) qs.set("status", f.statuses.join(","));
    if (f.company) qs.set("company", f.company);
    if (f.source) qs.set("source", f.source);
    if (f.japaneseLevel) qs.set("japanese_level", f.japaneseLevel);
    if (f.q) qs.set("q", f.q);
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
      syncUrl(next);
      return;
    }
    setLoading(true);
    try {
      const body = await fetchPage(next);
      if (!body) return;
      setFilters(next);
      syncUrl(next);
      setItems(sortByImportance(body.data.filter(notArchived)));
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
      setItems((prev) => [...prev, ...body.data.filter(notArchived)]);
      setMeta(body.meta);
    } finally {
      setLoading(false);
    }
  }

  const hasActiveFilter =
    !isDefaultStages ||
    filters.company !== null ||
    filters.source !== null ||
    filters.japaneseLevel !== null ||
    filters.q !== null;
  // "Clear filters" returns to the default (active) view, not to "All".
  const noFilters: Filters = {
    statuses: defaultStages,
    company: null,
    source: null,
    japaneseLevel: null,
    q: null,
  };

  // Enter (or the "x") applies the search; clearing to empty applies at once so
  // it does not sit as an active-but-invisible filter. Also resets the local box
  // whenever the applied term is cleared (e.g. by "Clear filters").
  function submitSearch() {
    applyFilters({ ...filters, q: qInput.trim() || null });
  }
  function clearAllFilters() {
    setQInput("");
    applyFilters(noFilters);
  }

  // Disjunctive faceting across all four filters (v1.10.0): each facet's counts
  // reflect the OTHER active filters, never its own selection, so picking a
  // company narrows the board list, the stage-chip counts, and the Japanese-
  // level counts alike. The stage filter constrains the others only when it is a
  // real subset (all chips lit is unfiltered), so a full chip row narrows nothing.
  type FacetRow = [string, string, Status, JapaneseLevel | null];
  type FacetDim = "company" | "board" | "status" | "jlpt";
  function matchesExcept(row: FacetRow, except: FacetDim): boolean {
    if (except !== "company" && filters.company && row[0] !== filters.company) return false;
    if (except !== "board" && filters.source && row[1] !== filters.source) return false;
    if (except !== "jlpt" && filters.japaneseLevel && row[3] !== filters.japaneseLevel) return false;
    if (
      except !== "status" &&
      filters.statuses.length < rendered.length &&
      !filters.statuses.includes(row[2])
    ) {
      return false;
    }
    return true;
  }
  function countBy<K>(except: FacetDim, keyOf: (r: FacetRow) => K | null): Map<K, number> {
    const counts = new Map<K, number>();
    for (const row of facets) {
      if (!matchesExcept(row, except)) continue;
      const key = keyOf(row);
      if (key === null) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }

  const companyOptions = [...countBy("company", (r) => r[0]).entries()].sort((a, b) => b[1] - a[1]);
  const boardOptions = [...countBy("board", (r) => r[1]).entries()].sort((a, b) => b[1] - a[1]);
  // Stage-chip and Japanese-level counts, narrowed by the other filters. The
  // chips render from `rendered` (which stages exist at all); these supply the
  // in-context number each shows.
  const statusCounts = countBy("status", (r) => r[2]);
  const jlptCounts = countBy("jlpt", (r) => r[3]);
  const narrowedTotal = [...statusCounts.values()].reduce((n, c) => n + c, 0);
  const activeCount = rendered.reduce(
    (n, s) => (activeStates.includes(s) ? n + (statusCounts.get(s) ?? 0) : n),
    0,
  );

  // Chip disclosure (v1.11.0): the active stages sit inline, the closed ones
  // collapse behind a "Closed stages" toggle: thirteen chips is past the ~10
  // Baymard found scannable, and v1.11.0's active-default only hides them until
  // "All" or a closed stage is picked, which is the row this trims. The split is
  // the fetched `active_states`, so nothing here enumerates the FSM. When that
  // set is unknown (/transitions failed, `activeRendered` empty) there is no
  // split to make and every chip renders inline as before. A selected closed
  // chip (a shared ?status=rejected URL, or "All") forces the group open and
  // cannot be collapsed away, so a lit chip is never hidden behind the toggle.
  const inlineChips = activeRendered.length > 0 ? activeRendered : rendered;
  const closedChips = activeRendered.length > 0 ? rendered.filter((s) => !activeStates.includes(s)) : [];
  const closedSelected = closedChips.some((s) => filters.statuses.includes(s));
  const closedOpen = showClosed || closedSelected;

  // One chip, rendered inline or inside the disclosure: a real checkbox so the
  // mark is structural, not a colour alone (WCAG 1.4.1); the status tint drops
  // when unselected, a redundant scan aid on a wide row rather than the signal.
  function StageChip(status: Status) {
    const on = filters.statuses.includes(status);
    return (
      <label
        key={status}
        title={ts(`description.${status}`)}
        className={`inline-flex min-h-10 cursor-pointer items-center gap-2 px-3 py-1 text-xs font-medium ring-1 ring-inset transition ${on ? statusBadgeClass(status) : "bg-sand/40 text-ink-soft ring-midnight/20 hover:text-midnight"
          }`}
      >
        <input
          type="checkbox"
          checked={on}
          onChange={() => toggleStatus(status)}
          className="size-3.5 accent-current"
        />
        {ts(`label.${status}`)} <span className="font-mono">{statusCounts.get(status) ?? 0}</span>
      </label>
    );
  }

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
          {/* Free-text search (v1.11.0): the one filter that is not a dropdown,
              because the match is partial. Enter (or clearing the box) applies
              it; a server `q` param, so it sees every page, not only loaded ones. */}
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              submitSearch();
            }}
            className="block text-sm"
          >
            <label className="kk-label" htmlFor="list-search">
              {t("search")}
            </label>
            <input
              id="list-search"
              type="search"
              value={qInput}
              disabled={loading}
              onChange={(e) => {
                const v = e.target.value;
                setQInput(v);
                // Clearing the box (the "x", or erasing it) applies at once;
                // typing waits for Enter so each keystroke is not a refetch.
                if (v === "" && filters.q) applyFilters({ ...filters, q: null });
              }}
              placeholder={t("searchPlaceholder")}
              className="mt-1.5 block min-w-44 border border-dune bg-linen px-3 py-1.5 text-sm text-midnight placeholder:text-ink-soft/50 disabled:opacity-50"
            />
          </form>
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
          {/* Now cross-narrowed and counted like the other two (v1.10.0): the
              facets payload carries japanese_level, so this reads the same
              disjunctive count. The fixed taxonomy still renders every level;
              a level with no matching rows shows 0, which is honest. */}
          <FilterSelect
            label={t("japaneseLevel")}
            value={filters.japaneseLevel ?? ""}
            disabled={loading}
            allLabel={t("allLevels")}
            options={JAPANESE_LEVELS.map((l) => ({
              value: l,
              label: tl(l),
              count: jlptCounts.get(l) ?? 0,
            }))}
            onChange={(value) =>
              applyFilters({ ...filters, japaneseLevel: (value || null) as JapaneseLevel | null })
            }
          />
          {hasActiveFilter && (
            <button
              onClick={clearAllFilters}
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
                count={narrowedTotal}
                onClick={() => applyFilters({ ...filters, statuses: rendered })}
              />
              {activeRendered.length > 0 && (
                <Preset
                  label={t("activeStages")}
                  count={activeCount}
                  onClick={() => applyFilters({ ...filters, statuses: activeRendered })}
                />
              )}
              <Preset label={t("noStages")} onClick={() => applyFilters({ ...filters, statuses: [] })} />
            </div>

            {inlineChips.map(StageChip)}
            {closedChips.length > 0 &&
              (closedOpen ? (
                <>
                  {closedChips.map(StageChip)}
                  {/* Only a collapse control when nothing closed is selected;
                      a lit closed chip keeps the group open on purpose. */}
                  {!closedSelected && (
                    <button
                      type="button"
                      onClick={() => setShowClosed(false)}
                      className="inline-flex min-h-10 items-center px-3 py-1 text-xs text-ink-soft underline underline-offset-4 transition hover:text-midnight"
                    >
                      {t("showFewerStages")}
                    </button>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowClosed(true)}
                  className="inline-flex min-h-10 items-center gap-1 border border-dashed border-dune bg-linen px-3 py-1 text-xs font-medium text-ink-soft transition hover:bg-sand hover:text-midnight"
                >
                  {t("showClosedStages", { count: closedChips.length })}
                </button>
              ))}
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
          {/* "Add your first" only when the account genuinely has no rows, read
              from the unfiltered `rendered` (by_status), NOT from hasActiveFilter:
              a URL like ?status=accepted is a real filter the server answers with
              zero rows for a user who has applications but none accepted, and the
              client can seed it as all-lit (no chip exists for it). Keying on
              rendered means that case reads as "no matches", not "empty account". */}
          {rendered.length === 0 ? (
            <>
              <p className="text-ink-soft">{t("empty")}</p>
              <Link
                href="/applications/new"
                className="mt-3 inline-block text-sm font-medium text-cobalt underline underline-offset-4 hover:text-cobalt-2"
              >
                {t("addFirst")}
              </Link>
            </>
          ) : (
            <p className="text-ink-soft">{t("noMatches")}</p>
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
