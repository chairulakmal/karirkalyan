import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { NavLink } from "@/app/components/nav-link";
import { LocaleSwitcher } from "@/app/components/locale-switcher";
import { Mark, Wordmark } from "@/app/components/wordmark";
import { ServiceWorkerRegistrar } from "@/app/components/service-worker-registrar";
import { TabBar } from "@/app/components/tab-bar";
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
            {/* Visible at every width: the tab bar carries the nav labels
                below sm, so the wordmark no longer competes with them. */}
            <Wordmark size="sm" />
          </Link>
          {/* Named because below sm two nav landmarks coexist — this one and
              the tab bar ("Primary") — and an unnamed landmark next to a named
              one reads as an afterthought in a screen-reader landmark list. */}
          <nav
            aria-label={t("account")}
            className="flex items-center gap-4 whitespace-nowrap text-sm sm:gap-5"
          >
            {/* The three page links hide below sm — the bottom tab bar is the
                primary nav there. Sign-out and locale stay: the bar has no
                room for either, and both must remain reachable on a phone. */}
            <span className="hidden sm:block">
              <NavLink href="/dashboard">{t("dashboard")}</NavLink>
            </span>
            <span className="hidden sm:block">
              <NavLink href="/board">{t("board")}</NavLink>
            </span>
            <span className="hidden sm:block">
              <NavLink href="/applications/new">{t("new")}</NavLink>
            </span>
            {/* Settings is not in the tab bar, so unlike the three links above
                it has no phone home — that is deliberate: passkey enrollment
                is desktop-first (SPEC.md § Passkeys), and the page stays
                reachable by URL on any width. */}
            <span className="hidden sm:block">
              <NavLink href="/settings">{t("settings")}</NavLink>
            </span>
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
      <TabBar />
      <ServiceWorkerRegistrar />
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
