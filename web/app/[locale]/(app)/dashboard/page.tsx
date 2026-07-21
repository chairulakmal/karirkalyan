import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { apiFetch } from "@/app/lib/api";
import type {
  Application,
  DashboardStats,
  Paginated,
  Status,
  TransitionTable,
} from "@/app/lib/types";
import { InfoPopover } from "@/app/components/info-popover";
import { Phrase } from "@/app/components/phrase";
import { ProfileCard } from "@/app/components/profile-card";
import { ApplicationsList } from "./applications-list";
import { GhostRiskCard } from "./ghost-risk-card";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("dashboard");

  // The URL filters the first paint (v1.10.0): a shared/bookmarked filtered view
  // must render filtered from the server, not correct itself client-side. Only
  // string params are honoured; ListQuery ignores any junk among them, so a
  // hand-edited URL degrades to the unfiltered list rather than erroring.
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);
  const urlFilters = {
    status: str(sp.status),
    company: str(sp.company),
    source: str(sp.source),
    japaneseLevel: str(sp.japanese_level),
  };
  // The dashboard defaults to active applications (SPEC.md § Dashboard), so the
  // status the first paint fetches has to be chosen from two things it must learn
  // first: which stages are active (/transitions) and whether the account has any
  // active rows (/dashboard's by_status). Both are awaited before the apps fetch,
  // so the server returns exactly the default view with no client refetch, and
  // neither FSM set is mirrored in TypeScript. /dashboard also carries the user,
  // so there is still no second /me request (<ProfileCard> takes it as a prop).
  const [statsRes, tableRes] = await Promise.all([
    apiFetch<DashboardStats>("/dashboard"),
    apiFetch<TransitionTable>("/transitions"),
  ]);
  // `ok` does not imply a populated `data` (apiFetch returns `null as T` for a
  // 204 or a non-JSON 200), and a 200 does not imply *this* payload: web and api
  // are separate Railway services, so during a deploy window /transitions can
  // answer from the release before active_states existed. Missing reads as
  // absent, which is already the failure path (it drops the default to
  // unfiltered below).
  const activeStates = tableRes.ok ? (tableRes.data?.active_states ?? []) : [];
  const states = tableRes.ok ? (tableRes.data?.states ?? []) : [];
  const byStatus: Partial<Record<Status, number>> = statsRes.ok ? (statsRes.data?.by_status ?? {}) : {};

  const appsQs = new URLSearchParams({ limit: "10" });
  if (urlFilters.company) appsQs.set("company", urlFilters.company);
  if (urlFilters.source) appsQs.set("source", urlFilters.source);
  if (urlFilters.japaneseLevel) appsQs.set("japanese_level", urlFilters.japaneseLevel);
  // The default status, sent explicitly (never the empty "unfiltered" request, so
  // ListQuery's wire meaning stays the board's: absent = everything): a URL that
  // names a status wins; else the active stages when the account has any active
  // rows; else the full non-archived row, so an all-closed account sees its
  // applications rather than an empty screen; else (table failed) the non-archived
  // statuses /dashboard reports as having rows, or unfiltered only if that also
  // failed. The point is to fetch exactly the set the chips will claim (or a
  // row-equivalent superset), so the client's matching selection never renders a
  // "no matches" beside applications it simply did not fetch.
  const hasActiveRows = statsRes.ok && activeStates.some((s) => (byStatus[s] ?? 0) > 0);
  const nonArchived = states.filter((s) => s !== "archived");
  // /transitions failed, so the active set is unknown; but /dashboard's by_status
  // still names every status that has rows, and that is exactly what the client's
  // chip row is built from. Fetch those (minus archived) rather than the whole
  // unfiltered set, which would pull archived rows the client then has to drop.
  const nonArchivedWithRows = Object.keys(byStatus).filter((s) => s !== "archived");
  const defaultStatus =
    activeStates.length === 0
      ? statsRes.ok && nonArchivedWithRows.length > 0
        ? nonArchivedWithRows.join(",")
        : null
      : statsRes.ok && !hasActiveRows
        ? nonArchived.join(",")
        : activeStates.join(",");
  const statusParam = urlFilters.status ?? defaultStatus;
  if (statusParam) appsQs.set("status", statusParam);

  const appsRes = await apiFetch<Paginated<Application>>(`/applications?${appsQs}`);

  if (!appsRes.ok) {
    return (
      <div className="border border-danger/40 bg-danger/10 p-5 text-sm text-danger">
        {t("failedToLoad", { message: appsRes.error })}
      </div>
    );
  }

  const { data: applications, meta } = appsRes.data;
  const stats = statsRes.ok ? statsRes.data : null;
  const me = stats?.user ?? null;
  // archived is excluded from the dashboard entirely (SPEC.md § Dashboard): no
  // chip, never in "All", never counted. Drop it from the facets here, at the one
  // choke point, so every facet-derived count downstream (company/board/level
  // options, the "All" total, the stage-chip counts) is non-archived by
  // construction; row[2] is the status column of the facet tuple.
  const facets = (stats?.facets ?? []).filter((row) => row[2] !== "archived");
  // Non-archived tally, matching every other count on the page: archived is
  // excluded from the dashboard entirely, so the header must not count it either
  // (the ja label reads 「管理中」/"currently managing", which archived is not).
  const total = stats
    ? (Object.entries(stats.by_status) as [Status, number][]).reduce(
        (n, [s, c]) => (s === "archived" ? n : n + c),
        0,
      )
    : applications.length;

  // Same exclusion for the chip set: one chip renders per non-archived status
  // that has rows, so dropping the archived bucket removes the chip and, since
  // `rendered` is derived from this, its place in "All" too.
  const statusBuckets = stats
    ? (Object.entries(stats.by_status) as [Status, number][]).filter(([s]) => s !== "archived")
    : [];
  // `by_status` is `group(:status).count` — GROUP BY with no ORDER BY, so its
  // order is the query plan's, not a promise. Sorted against the FSM's own state
  // list so the chip row reads wishlist→archived and, more to the point, sits
  // still between reloads. A state the table doesn't know sorts last rather than
  // vanishing; a failed table leaves the order alone rather than emptying it.
  const stateRank = new Map(states.map((s, i) => [s, i]));
  statusBuckets.sort(
    ([a], [b]) => (stateRank.get(a) ?? states.length) - (stateRank.get(b) ?? states.length),
  );

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-dune pb-6">
        <div>
          <p className="kk-label">{t("eyebrow")}</p>
          <h1 className="mt-1 text-3xl">
            <Phrase>{t("title")}</Phrase>
          </h1>
          <p className="mt-1 font-mono text-xs text-ink-soft">{t("tracked", { count: total })}</p>
        </div>
        <Link
          href="/applications/new"
          className="bg-cobalt px-4 py-2 text-sm font-medium text-linen transition hover:bg-cobalt-2"
        >
          {t("newApplication")}
        </Link>
      </header>

      {/* Above the fold, above the profile: it is the only block on this page
          that asks the user to do something, and it renders nothing when there
          is nothing to act on. */}
      {stats && <GhostRiskCard risk={stats.ghost_risk} />}

      <ProfileCard user={me} />

      {/* Stat cards (v1.10.0): response rate, time-in-stage, ghost rate, beside
          the avg-days line rather than on a dedicated /insights page: a new
          route and nav weight for one user is not worth it (SPEC.md). Each hides
          until it has data, so a fresh account shows none rather than "0%". */}
      {stats && (stats.response_rate != null || stats.avg_days_in_stage != null || stats.ghost_rate != null) && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {stats.response_rate != null && (
            <StatCard label={t("responseRate")} value={`${stats.response_rate}%`} />
          )}
          {stats.avg_days_in_stage != null && (
            <StatCard label={t("timeInStage")} value={t("daysValue", { days: stats.avg_days_in_stage })} />
          )}
          {stats.ghost_rate != null && (
            <StatCard
              label={t("ghostRate")}
              value={`${stats.ghost_rate}%`}
              danger={stats.ghost_rate >= 30}
            />
          )}
        </div>
      )}

      {stats?.avg_days_to_offer != null && (
        // <div>, not <p>: InfoPopover renders a <details>, which is flow
        // content and invalid inside a paragraph (React would warn on hydrate).
        <div className="font-mono text-xs text-ink-soft">
          {t("avgDays")} <span className="text-midnight">{stats.avg_days_to_offer}</span>
          <span className="ml-2 inline-block align-middle">
            <InfoPopover label={t("avgDaysAria")}>
              <p className="font-sans text-sm leading-relaxed text-ink-soft">
                {t("avgDaysTooltip")}
              </p>
            </InfoPopover>
          </span>
        </div>
      )}

      <ApplicationsList
        initialItems={applications}
        initialMeta={meta}
        statusBuckets={statusBuckets}
        activeStates={activeStates}
        facets={facets}
        atRiskIds={stats?.ghost_risk.at_risk.map((a) => a.id) ?? []}
        initialFilters={urlFilters}
      />
    </div>
  );
}

// A compact stat tile. `danger` tints a bad ghost rate; nothing else changes.
function StatCard({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="border border-dune bg-linen p-3">
      <p className="kk-label">{label}</p>
      <p className={`mt-1 font-mono text-xl ${danger ? "text-danger" : "text-midnight"}`}>{value}</p>
    </div>
  );
}
