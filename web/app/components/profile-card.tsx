import { getLocale, getTranslations } from "next-intl/server";
import type { User } from "@/app/lib/types";

/**
 * Who you are, and what you can take with you — one card, because they are one
 * thought. See SPEC.md § Exports → The download surface.
 *
 * Takes the user as a prop and does not fetch one: /dashboard's payload already
 * carries it, which is why that page issues no second /me request. A component
 * that fetched its own would put the request back on every page importing this.
 */
export async function ProfileCard({ user }: { user: User | null }) {
  const [t, locale] = await Promise.all([getTranslations("dashboard"), getLocale()]);

  return (
    <section className="border border-dune bg-linen p-5">
      <p className="kk-label">{t("yourData")}</p>

      {/* Gated, because a failed /dashboard fetch leaves nothing to say here.
          The exports below are deliberately outside this gate — see the comment
          on them. */}
      {user && (
        <dl className="mt-3 flex flex-wrap gap-x-10 gap-y-2 text-sm">
          <div>
            <dt className="font-mono text-xs text-ink-soft">{t("email")}</dt>
            <dd className="mt-0.5 text-midnight">{user.email}</dd>
          </div>
          <div>
            <dt className="font-mono text-xs text-ink-soft">{t("memberSince")}</dt>
            <dd className="mt-0.5 text-midnight">
              {new Date(user.created_at).toLocaleDateString(locale, {
                year: "numeric",
                month: "long",
                day: "numeric",
                // Pinned like formatDate() — the API serialises in app time.
                timeZone: "Asia/Tokyo",
              })}
            </dd>
          </div>
        </dl>
      )}

      {/* Never gate this on `user`. /privacy promises the user can get their data
          out, and these two links are the only surface that honours it — hiding
          them when the dashboard fetch failed would remove it silently, in the
          moment the data looks least safe.

          Plain anchors, not next-intl <Link>: these are API routes, not localized
          pages. The API sends Content-Disposition: attachment, so the browser
          downloads rather than navigating — no `download` attribute needed, and the
          server keeps naming the file. */}
      <p className="mt-5 text-sm leading-relaxed text-ink-soft">{t("exports.blurb")}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/api/exports/applications"
          className="border border-dune px-4 py-2 text-sm font-medium text-midnight transition hover:border-cobalt hover:text-cobalt"
        >
          {t("exports.csv")}
        </a>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/api/exports/account"
          className="border border-dune px-4 py-2 text-sm font-medium text-midnight transition hover:border-cobalt hover:text-cobalt"
        >
          {t("exports.archive")}
        </a>
      </div>
    </section>
  );
}
