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
  const appsQs = new URLSearchParams({ limit: "10" });
  if (urlFilters.status) appsQs.set("status", urlFilters.status);
  if (urlFilters.company) appsQs.set("company", urlFilters.company);
  if (urlFilters.source) appsQs.set("source", urlFilters.source);
  if (urlFilters.japaneseLevel) appsQs.set("japanese_level", urlFilters.japaneseLevel);

  // /dashboard carries the user, so there is no second /me request: <ProfileCard>
  // takes `stats.user` as a prop rather than fetching one.
  const [appsRes, statsRes, tableRes] = await Promise.all([
    apiFetch<Paginated<Application>>(`/applications?${appsQs}`),
    apiFetch<DashboardStats>("/dashboard"),
    apiFetch<TransitionTable>("/transitions"),
  ]);

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
  const facets = stats?.facets ?? [];
  const total = stats?.total ?? applications.length;
  // Powers the "Active" preset and the overdue marker only, so a failed table
  // drops the preset rather than the list — the same tolerance this page
  // already extends to /dashboard itself.
  //
  // `ok` does not imply a populated `data` (apiFetch returns `null as T` for a
  // 204 or a non-JSON 200), and a 200 does not imply *this* payload: web and api
  // are separate Railway services, so during a deploy window /transitions can
  // answer from the release before active_states existed. Missing reads as
  // absent, which is already the failure path.
  const activeStates = tableRes.ok ? (tableRes.data?.active_states ?? []) : [];
  const states = tableRes.ok ? (tableRes.data?.states ?? []) : [];

  const statusBuckets = stats ? (Object.entries(stats.by_status) as [Status, number][]) : [];
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
