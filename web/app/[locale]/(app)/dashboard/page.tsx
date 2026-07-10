import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { apiFetch } from "@/app/lib/api";
import type { Application, DashboardStats, Paginated, Status, User } from "@/app/lib/types";
import { InfoPopover } from "@/app/components/info-popover";
import { ApplicationsList } from "./applications-list";

export default async function Dashboard() {
  const [t, locale] = await Promise.all([getTranslations("dashboard"), getLocale()]);
  const [appsRes, statsRes, meRes] = await Promise.all([
    apiFetch<Paginated<Application>>("/applications?limit=10"),
    apiFetch<DashboardStats>("/dashboard"),
    apiFetch<User>("/me"),
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
  const me = meRes.ok ? meRes.data : null;
  const statusBuckets = stats ? (Object.entries(stats.by_status) as [Status, number][]) : [];
  const facets = stats?.facets ?? [];
  const total = stats?.total ?? applications.length;

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-dune pb-6">
        <div>
          <p className="kk-label">{t("eyebrow")}</p>
          <h1 className="mt-1 text-3xl">{t("title")}</h1>
          <p className="mt-1 font-mono text-xs text-ink-soft">{t("tracked", { count: total })}</p>
        </div>
        <Link
          href="/applications/new"
          className="bg-cobalt px-4 py-2 text-sm font-medium text-linen transition hover:bg-cobalt-2"
        >
          {t("newApplication")}
        </Link>
      </header>

      {me && (
        <section className="border border-dune bg-linen p-5">
          <p className="kk-label">{t("profile")}</p>
          <dl className="mt-3 flex flex-wrap gap-x-10 gap-y-2 text-sm">
            <div>
              <dt className="font-mono text-xs text-ink-soft">{t("email")}</dt>
              <dd className="mt-0.5 text-midnight">{me.email}</dd>
            </div>
            <div>
              <dt className="font-mono text-xs text-ink-soft">{t("memberSince")}</dt>
              <dd className="mt-0.5 text-midnight">
                {new Date(me.created_at).toLocaleDateString(locale, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  // Pinned like formatDate() — the API serialises in app time.
                  timeZone: "Asia/Tokyo",
                })}
              </dd>
            </div>
          </dl>
        </section>
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
        facets={facets}
        total={total}
      />
    </div>
  );
}
