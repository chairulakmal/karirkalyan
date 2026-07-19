import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { GitHubIcon } from "@/app/components/github-icon";
import { LocaleSwitcher } from "@/app/components/locale-switcher";
import { PipelineDiagram } from "@/app/components/pipeline-diagram";
import { SiteFooter } from "@/app/components/site-footer";
import { Mark, Wordmark } from "@/app/components/wordmark";
import { Phrase } from "@/app/components/phrase";
import { REPO_URL } from "@/app/lib/links";

export default async function Home() {
  const t = await getTranslations("home");

  // Structured data is read by crawlers, not rendered — it takes the same
  // tagline as the page metadata, in whichever locale is being served.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "KarirKalyan",
    description: t("tagline"),
    url: "https://kk.chairulakmal.com",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web Browser",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    author: {
      "@type": "Person",
      name: "Chairul Akmal",
      url: "https://chairulakmal.com",
      sameAs: ["https://github.com/chairulakmal"],
    },
  };

  return (
    <div className="flex flex-1 flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className="border-b border-dune/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6 md:px-8">
          <div className="flex items-center gap-3">
            <Mark size={32} />
            <Wordmark size="md" />
          </div>
          <nav className="flex items-center gap-6 whitespace-nowrap text-sm">
            {/* Hidden below sm: the hero's primary CTA just below is the same
                destination, and dropping it keeps the header on one line at
                375px in Japanese (このプロジェクトについて is the widest label). */}
            <Link
              href="/about"
              className="hidden font-medium text-ink-soft transition hover:text-midnight sm:inline"
            >
              {t("about")}
            </Link>
            <Link
              href="/sign-in"
              className="font-medium text-ink-soft transition hover:text-midnight"
            >
              {t("signIn")}
            </Link>
            <LocaleSwitcher />
          </nav>
        </div>
      </header>

      <main className="flex-1 px-6 py-20 md:px-8 md:py-28">
        <div className="mx-auto w-full max-w-5xl">
          <p className="kk-label">
            {t.rich("eyebrow", {
              link: (chunks) => (
                <a
                  href="https://chairulakmal.com"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline underline-offset-4 hover:text-midnight"
                >
                  {chunks}
                </a>
              ),
            })}
          </p>

          {/* The headline is the only display-scale type on the site. It gets the
              144 optical cut; every other heading keeps the 36 cut from globals. */}
          <h1 className="kk-display mt-5 max-w-4xl text-[2.75rem] md:text-7xl">
            <Phrase>
              {t.rich("headline", {
                accent: (chunks) => (
                  <span className="italic text-cobalt">
                    <Phrase>{chunks}</Phrase>
                  </span>
                ),
              })}
            </Phrase>
          </h1>

          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-ink-soft">
            {t.rich("lede", { em: (chunks) => <em>{chunks}</em> })}
          </p>
          <p className="mt-5 font-mono text-xs tracking-wide text-ink-soft/80">{t("stack")}</p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              href="/about"
              className="inline-flex items-center justify-center bg-cobalt px-6 py-3 text-sm font-medium text-linen transition hover:bg-cobalt-2"
            >
              <Phrase>{t("ctaAbout")}</Phrase>
            </Link>
            <Link
              href="/sign-in"
              className="inline-flex items-center justify-center border border-midnight px-6 py-3 text-sm font-medium text-midnight transition hover:bg-linen"
            >
              <Phrase>{t("tryDemo")}</Phrase>
            </Link>
            <Link
              href={REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="ml-1 inline-flex items-center gap-2 px-2 py-3 text-sm text-ink-soft transition hover:text-midnight"
            >
              <GitHubIcon className="h-4 w-4" />
              <Phrase>{t("sourceCode")}</Phrase>
            </Link>
          </div>

          <PipelineDiagram />

          {/* Numbered, and divided by hairlines rather than whitespace: the page
              is arguing that structure is explicit, so it should look it. */}
          <ul className="mt-24 grid gap-px border border-dune bg-dune md:grid-cols-2 lg:grid-cols-4">
            {[
              { n: "01", title: t("fsmTitle"), body: t.rich("fsmBody", { em: (c) => <em>{c}</em> }) },
              { n: "02", title: t("auditTitle"), body: t("auditBody") },
              { n: "03", title: t("jobsTitle"), body: t("jobsBody") },
              { n: "04", title: t("boardTitle"), body: t("boardBody") },
            ].map(({ n, title, body }) => (
              <li key={n} className="bg-sand p-6 md:p-7">
                <p className="kk-num">{n}</p>
                <h2 className="mt-4 text-xl">
                  <Phrase>{title}</Phrase>
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </main>

      <SiteFooter wide />
    </div>
  );
}
