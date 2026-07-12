import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/app/components/locale-switcher";
import { SiteFooter } from "@/app/components/site-footer";
import { Mark, Wordmark } from "@/app/components/wordmark";
import { CONTACT_EMAIL } from "@/app/lib/links";

/**
 * The shell both legal pages render into — /privacy and /terms differ only in
 * their catalog namespace and their list of sections.
 *
 * Both are OPEN paths in proxy.ts, readable with or without a session: the people
 * a privacy policy most concerns are the ones already holding data in the system.
 * Like /about, the header therefore offers no "Sign in" link.
 */
export async function LegalPage({
  namespace,
  sections,
}: {
  namespace: "privacy" | "terms";
  sections: readonly string[];
}) {
  const t = await getTranslations(namespace);

  const rich = {
    em: (chunks: React.ReactNode) => <em>{chunks}</em>,
    strong: (chunks: React.ReactNode) => <strong className="text-midnight">{chunks}</strong>,
    code: (chunks: React.ReactNode) => (
      <code className="font-mono text-[0.9em] text-cobalt">{chunks}</code>
    ),
    mail: () => (
      <a
        href={`mailto:${CONTACT_EMAIL}`}
        className="text-cobalt underline underline-offset-4 transition hover:text-cobalt-2"
      >
        {CONTACT_EMAIL}
      </a>
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
          <p className="mt-3 font-mono text-xs text-ink-soft">{t("updated")}</p>
          <p className="mt-6 text-lg leading-relaxed text-ink-soft">{t("lede")}</p>

          <div className="mt-12">
            {sections.map((section) => (
              <section key={section} className="border-t border-dune py-8">
                <h2 className="text-xl leading-snug">{t(`${section}Title`)}</h2>
                <p className="mt-3 leading-relaxed text-ink-soft">
                  {t.rich(`${section}Body`, rich)}
                </p>
              </section>
            ))}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
