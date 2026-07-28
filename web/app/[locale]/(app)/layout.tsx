import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { NavLink } from "@/app/components/nav-link";
import { LocaleSwitcher } from "@/app/components/locale-switcher";
import { Mark, Wordmark } from "@/app/components/wordmark";
import { ServiceWorkerRegistrar } from "@/app/components/service-worker-registrar";
import { TabBar } from "@/app/components/tab-bar";
import { ToastProvider } from "@/app/components/toast";
import { AccountMenu } from "./account-menu";
import { ACCOUNT_EMAIL_COOKIE_NAME } from "@/app/lib/api";
import { REPO_URL } from "@/app/lib/links";

const reviewerLinkClass = "underline underline-offset-4 hover:text-cobalt";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("nav");
  // The display cookie the sign-in handlers set beside the JWT (SPEC.md
  // § Auth flow): read here, passed down as a prop, never fetched. Null for
  // sessions minted before the cookie existed; it ages out within a day.
  const email = (await cookies()).get(ACCOUNT_EMAIL_COOKIE_NAME)?.value ?? null;

  return (
    <ToastProvider>
      {/* Skip link. Landmarks arguably satisfy 2.4.1 for a screen-reader user,
          but a sighted keyboard-only user had no bypass at all and paid ~7 tab
          stops (wordmark, three nav links, account chip, locale switcher) on
          every single page. Visually hidden until focused, which is the one
          place `sr-only` is the wrong answer. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-cobalt focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-linen"
      >
        {t("skipToContent")}
      </a>
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
                primary nav there. */}
            <span className="hidden sm:block">
              <NavLink href="/dashboard">{t("dashboard")}</NavLink>
            </span>
            <span className="hidden sm:block">
              <NavLink href="/board">{t("board")}</NavLink>
            </span>
            <span className="hidden sm:block">
              <NavLink href="/applications/new">{t("new")}</NavLink>
            </span>
            {/* Settings and sign-out live in the account menu, at every width:
                the push enable toggle is on /settings and the installed app is
                the device push targets, so the phone must reach the page
                without a typed URL (SPEC.md § Auth flow). Locale stays outside
                the menu: language switching is a first-visit action. */}
            <AccountMenu email={email} />
            <LocaleSwitcher />
          </nav>
        </div>
      </header>
      {/* tabIndex={-1} so the skip link's focus actually lands here: a <main>
          is not focusable by default, and without it the browser would move the
          scroll position but leave focus at the top of the tab order. */}
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        {children}
      </main>
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
    </ToastProvider>
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
