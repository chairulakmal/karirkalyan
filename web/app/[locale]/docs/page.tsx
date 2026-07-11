import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/app/components/locale-switcher";
import { SiteFooter } from "@/app/components/site-footer";
import { Mark, Wordmark } from "@/app/components/wordmark";
import { REPO_URL, API_DOCS_URL } from "@/app/lib/links";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "docs" });

  return { title: t("title"), description: t("lede") };
}

// Method and path are code, so they are not translated — only the `key`, which
// names the sentence in the catalog, changes with locale. The order mirrors
// `api/config/routes.rb`.
const ENDPOINTS = [
  { method: "POST", path: "/api/v1/auth/sign_up", key: "signUp" },
  { method: "POST", path: "/api/v1/auth/sign_in", key: "signIn" },
  { method: "DELETE", path: "/api/v1/auth/sign_out", key: "signOut" },
  { method: "GET", path: "/api/v1/applications", key: "index" },
  { method: "POST", path: "/api/v1/applications", key: "create" },
  { method: "POST", path: "/api/v1/applications/prefill", key: "prefill" },
  { method: "GET", path: "/api/v1/applications/:id", key: "show" },
  { method: "PATCH", path: "/api/v1/applications/:id", key: "update" },
  { method: "DELETE", path: "/api/v1/applications/:id", key: "destroy" },
  { method: "PATCH", path: "/api/v1/applications/:id/transition", key: "transition" },
  { method: "GET", path: "/api/v1/applications/:id/resume", key: "resume" },
  { method: "GET", path: "/api/v1/applications/:id/cover_letter", key: "coverLetter" },
  { method: "GET", path: "/api/v1/transitions", key: "transitionTable" },
  { method: "GET", path: "/api/v1/dashboard", key: "dashboard" },
  { method: "GET", path: "/api/v1/me", key: "me" },
  { method: "GET", path: "/up", key: "up" },
] as const;

const ERROR_CODES = ["409", "422", "502", "503"] as const;

// The verb carries the risk, so it carries the colour: reads recede, writes take
// the brand primary, and `DELETE` takes the danger token `format.ts` gives the
// terminal-negative statuses. Nothing else on the page uses it.
const METHOD_CLASS: Record<(typeof ENDPOINTS)[number]["method"], string> = {
  GET: "text-ink-soft",
  POST: "text-cobalt",
  PATCH: "text-cobalt",
  DELETE: "text-danger",
};

/**
 * Frames the API instead of making the raw rswag UI the destination. The Swagger
 * console stays reachable — it is the reference — but a reviewer who clicks
 * "API docs" should first land somewhere that reads like the rest of the app.
 *
 * An OPEN path in proxy.ts, like `/about`: readable with or without a session.
 */
export default async function Docs() {
  const t = await getTranslations("docs");

  const rich = {
    em: (chunks: React.ReactNode) => <em>{chunks}</em>,
    code: (chunks: React.ReactNode) => (
      <code className="font-mono text-[0.9em] text-cobalt">{chunks}</code>
    ),
  };

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-dune/60">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-6">
          <Link href="/" className="flex items-center gap-3">
            <Mark size={32} />
            <Wordmark size="md" />
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/" className="font-medium text-ink-soft transition hover:text-midnight">
              {t("home")}
            </Link>
            <LocaleSwitcher />
          </nav>
        </div>
      </header>

      <main className="px-6 py-20 md:py-24">
        <div className="mx-auto w-full max-w-2xl">
          <p className="kk-label">{t("eyebrow")}</p>
          <h1 className="mt-4 text-4xl leading-tight md:text-5xl">{t("title")}</h1>
          <p className="mt-6 text-lg leading-relaxed text-ink-soft">{t("lede")}</p>

          <section className="mt-16">
            <h2 className="text-2xl leading-snug">{t("authTitle")}</h2>
            <p className="mt-4 text-ink-soft">{t.rich("authBody", rich)}</p>
          </section>

          <section className="mt-14">
            <h2 className="text-2xl leading-snug">{t("scopeTitle")}</h2>
            <p className="mt-4 text-ink-soft">{t.rich("scopeBody", rich)}</p>
          </section>

          <section className="mt-14">
            <h2 className="text-2xl leading-snug">{t("errorsTitle")}</h2>
            <p className="mt-4 text-ink-soft">{t.rich("errorsBody", rich)}</p>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-dune">
                    <th className="kk-label py-2 pr-6 font-normal">{t("errorTable.code")}</th>
                    <th className="kk-label py-2 font-normal">{t("errorTable.when")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ERROR_CODES.map((code) => (
                    <tr key={code} className="border-b border-dune/50">
                      <td className="w-[4.5rem] py-3 pr-6 align-baseline font-mono text-cobalt">
                        {code}
                      </td>
                      <td className="py-3 align-baseline text-ink-soft">
                        {t(`errorTable.${code}`)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-14">
            <h2 className="text-2xl leading-snug">{t("paginationTitle")}</h2>
            <p className="mt-4 text-ink-soft">{t.rich("paginationBody", rich)}</p>
          </section>

          <section className="mt-14">
            <h2 className="text-2xl leading-snug">{t("endpointsTitle")}</h2>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <tbody>
                  {ENDPOINTS.map(({ method, path, key }) => (
                    <tr key={`${method} ${path}`} className="border-b border-dune/50">
                      {/* Fixed width so the paths line up into a single column
                          rather than ragging off the longest verb. */}
                      <td
                        className={`w-[4.5rem] py-3 pr-4 align-baseline font-mono text-xs ${METHOD_CLASS[method]}`}
                      >
                        {method}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-6 align-baseline font-mono text-xs text-midnight">
                        {path}
                      </td>
                      <td className="py-3 align-baseline text-ink-soft">{t(`endpoint.${key}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-20 border-t border-dune pt-10">
            <h2 className="text-2xl leading-snug">{t("swaggerTitle")}</h2>
            <p className="mt-4 text-ink-soft">{t("swaggerBody")}</p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={API_DOCS_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center justify-center bg-cobalt px-6 py-3 text-sm font-medium text-linen transition hover:bg-cobalt-2"
              >
                {t("openSwagger")}
              </Link>
              <Link
                href={REPO_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center justify-center border border-midnight px-6 py-3 text-sm font-medium text-midnight transition hover:bg-linen"
              >
                {t("sourceCode")}
              </Link>
            </div>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
