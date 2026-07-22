import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/app/components/locale-switcher";
import { SiteFooter } from "@/app/components/site-footer";
import { Mark, Wordmark } from "@/app/components/wordmark";
import { Phrase } from "@/app/components/phrase";
import { HspCalculator } from "./hsp-calculator";

// The primary MOJ / ISA sources the point values and gates come from, verified
// 2026-07-21. Labels are translated; the URLs are the authorities themselves.
// The points table exists in both languages: link a reader to the one they can
// read, the MOJ's own English translation on /en, the Japanese original on /ja.
const POINTS_TABLE_PDF: Record<string, string> = {
  en: "https://www.moj.go.jp/isa/content/001398882.pdf",
  ja: "https://www.moj.go.jp/isa/content/930001657.pdf",
};

function hspSources(locale: string) {
  return [
    { key: "sourcePoints", href: POINTS_TABLE_PDF[locale] ?? POINTS_TABLE_PDF.en },
    { key: "sourceStatus", href: "https://www.moj.go.jp/isa/applications/status/designatedactivities02_00004.html" },
    { key: "sourceJskip", href: "https://www.moj.go.jp/isa/applications/resources/nyuukokukanri01_00009.html" },
  ] as const;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "hsp" });
  return { title: t("title"), description: t("lede") };
}

/**
 * A public, no-auth 高度専門職 (Highly Skilled Professional) points calculator on
 * the marketing side. An OPEN path in proxy.ts (readable with or without a
 * session), so the header offers no "Sign in" link. It serves strangers, not the
 * app's one loyal user: the trade is portfolio/SEO value, and its numbers ride
 * the same annual visa-research pass as the in-app residence guidance
 * (SPEC.md § HSP calculator).
 */
export default async function HspCalculatorPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("hsp");
  const sources = hspSources(locale);

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-dune/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6 md:px-8">
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

      <main className="hsp-system px-6 py-16 md:px-8 md:py-20">
        <div className="mx-auto w-full max-w-5xl">
          <p className="kk-label">{t("eyebrow")}</p>
          <h1 className="mt-4 max-w-3xl text-4xl leading-tight md:text-5xl">
            <Phrase>{t("title")}</Phrase>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft">{t("lede")}</p>

          <HspCalculator />

          {/* Primary sources, so a stranger can verify the numbers themselves.
              External links open in a new tab (rel=noopener). The ↗ marks the
              hop off-site. */}
          <section className="hsp-lg mt-12 border-t border-dune pt-6">
            <h2 className="kk-label">{t("sourcesTitle")}</h2>
            <ul className="mt-3 space-y-2 text-base">
              {sources.map((source) => (
                <li key={source.href}>
                  <a
                    href={source.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-baseline gap-1 text-cobalt underline underline-offset-4 hover:text-cobalt-2"
                  >
                    {t(source.key)}
                    <span aria-hidden="true" className="text-xs">↗</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>

      <SiteFooter wide minimal />
    </div>
  );
}
