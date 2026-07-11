import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { NavLink } from "@/app/components/nav-link";
import { LocaleSwitcher } from "@/app/components/locale-switcher";
import { Mark, Wordmark } from "@/app/components/wordmark";
import { SignOutButton } from "./sign-out-button";
import { REPO_URL } from "@/app/lib/links";

const reviewerLinkClass = "underline underline-offset-4 hover:text-cobalt";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("nav");

  return (
    <>
      <header className="border-b border-dune bg-linen">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="flex items-center gap-3">
            <Mark size={28} />
            {/* Wordmark text hidden below sm — the mark carries the identity
                and frees the width the Japanese nav labels need at 375px. */}
            <span className="hidden sm:block">
              <Wordmark size="sm" />
            </span>
          </Link>
          <nav className="flex items-center gap-4 whitespace-nowrap text-sm sm:gap-5">
            {/* Hidden below sm: the mark on the left already links to the
                dashboard, so the label is redundant where width is scarce. */}
            <span className="hidden sm:block">
              <NavLink href="/dashboard">{t("dashboard")}</NavLink>
            </span>
            {/* Stays visible below sm: unlike the dashboard (the mark links
                there), there is no second way to reach the board. */}
            <NavLink href="/board">{t("board")}</NavLink>
            <NavLink href="/applications/new">{t("new")}</NavLink>
            <SignOutButton />
            <LocaleSwitcher />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">{children}</main>
      <footer className="border-t border-dune">
        <div className="mx-auto max-w-5xl px-6 py-5 text-xs text-ink-soft">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="kk-label">{t("forReviewers")}</span>
            {/* /about and /docs are OPEN paths in proxy.ts, so these resolve for
                a signed-in reader instead of bouncing back to the dashboard. */}
            <Link href="/about" className={reviewerLinkClass}>
              {t("about")}
            </Link>
            <Link href="/docs" className={reviewerLinkClass}>
              {t("apiDocs")}
            </Link>
            <ReviewerLink href={REPO_URL}>{t("source")}</ReviewerLink>
          </div>
        </div>
      </footer>
    </>
  );
}

function ReviewerLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={reviewerLinkClass}
    >
      {children}
    </a>
  );
}
