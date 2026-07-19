import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/app/components/locale-switcher";
import { SiteFooter } from "@/app/components/site-footer";
import { Mark, Wordmark } from "@/app/components/wordmark";
import { Phrase } from "@/app/components/phrase";
import { REPO_URL } from "@/app/lib/links";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about" });

  return { title: t("title"), description: t("lede") };
}

/**
 * The homepage's primary CTA lands here, so this page carries the visit: four
 * decisions, each stated as the cheaper alternative it rejected.
 *
 * It is an OPEN path in proxy.ts — readable with or without a session — which is
 * why the header offers no "Sign in" link. A signed-in reader arriving here from
 * the dashboard should not be invited to sign in again.
 */
export default async function About() {
  const t = await getTranslations("about");

  const rich = {
    em: (chunks: React.ReactNode) => <em>{chunks}</em>,
    code: (chunks: React.ReactNode) => (
      <code className="font-mono text-[0.9em] text-cobalt">{chunks}</code>
    ),
  };

  const sections = ["rails", "fsm", "jobs", "files"] as const;

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
          <h1 className="mt-4 text-4xl leading-tight md:text-5xl">
            <Phrase>{t("title")}</Phrase>
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-ink-soft">{t("lede")}</p>

          {/* The lede promises four decisions, so the page counts them off. The
              ordinals hang in a gutter on desktop and sit above the heading on a
              phone, where a 4rem column would eat the measure. */}
          <ol className="mt-16">
            {sections.map((section, i) => (
              <li
                key={section}
                className="border-t border-dune py-10 md:grid md:grid-cols-[4rem_1fr] md:gap-6"
              >
                <p className="kk-num md:pt-2.5">{String(i + 1).padStart(2, "0")}</p>
                <div className="mt-3 md:mt-0">
                  <h2 className="text-2xl leading-snug">
                    <Phrase>{t(`${section}Title`)}</Phrase>
                  </h2>
                  <p className="mt-4 leading-relaxed text-ink-soft">
                    {t.rich(`${section}Body`, rich)}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <section className="border-t border-dune pt-10">
            <h2 className="text-2xl leading-snug">
              <Phrase>{t("closingTitle")}</Phrase>
            </h2>
            <p className="mt-4 text-ink-soft">{t("closingBody")}</p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/sign-in"
                className="inline-flex items-center justify-center bg-cobalt px-6 py-3 text-sm font-medium text-linen transition hover:bg-cobalt-2"
              >
                {t("tryDemo")}
              </Link>
              <Link
                href={REPO_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center justify-center border border-midnight px-6 py-3 text-sm font-medium text-midnight transition hover:bg-linen"
              >
                {t("sourceCode")}
              </Link>
              <Link
                href="/docs"
                className="ml-1 px-2 py-3 text-sm text-ink-soft underline underline-offset-4 transition hover:text-midnight"
              >
                {t("apiDocs")}
              </Link>
            </div>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
