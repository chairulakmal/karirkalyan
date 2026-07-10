import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { GitHubIcon } from "@/app/components/github-icon";
import { REPO_URL } from "@/app/lib/links";

/**
 * Shared footer for the public pages (home, about, docs). `wide` matches the
 * homepage's 5xl measure; the prose pages keep the 2xl measure of their text.
 */
export async function SiteFooter({ wide = false }: { wide?: boolean }) {
  const t = await getTranslations("footer");

  return (
    <footer className="border-t border-dune px-6 py-6 text-xs text-ink-soft md:px-8">
      <div
        className={`mx-auto flex flex-wrap items-center justify-between gap-3 ${
          wide ? "max-w-5xl" : "max-w-2xl"
        }`}
      >
        <p>{t("copyright")}</p>
        <p className="flex items-center gap-4">
          {/* Points at the in-app docs page, not the raw Swagger UI: the
              reference is one click further, framed rather than dumped. */}
          <Link href="/docs" className="underline underline-offset-4 hover:text-midnight">
            {t("apiDocs")}
          </Link>
          <Link
            href={`${REPO_URL}/blob/main/LICENSE`}
            target="_blank"
            rel="noreferrer noopener"
            className="underline underline-offset-4 hover:text-midnight"
          >
            {t("license")}
          </Link>
          <Link
            href={REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1.5 hover:text-midnight"
            aria-label={t("githubAria")}
          >
            <GitHubIcon className="h-3.5 w-3.5" />
            <span>GitHub</span>
          </Link>
        </p>
      </div>
    </footer>
  );
}
