"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

// The header nav relocated for phone widths, not a new information
// architecture: same three destinations, same `nav` catalog keys. Hidden at
// `sm` and up, where the header nav is unchanged.
//
// `sticky`, not `fixed`: the body is a flex column, so a sticky bar
// participates in layout — content and footer end above it at full scroll,
// and no sibling needs a compensating bottom padding.
const TABS = [
  { href: "/dashboard", key: "dashboard" },
  { href: "/applications/new", key: "new" },
  { href: "/board", key: "board" },
] as const;

export function TabBar() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <nav
      aria-label={t("primary")}
      className="sticky bottom-0 z-10 border-t border-dune bg-linen pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <div className="grid grid-cols-3">
        {TABS.map(({ href, key }) => {
          // Exact match, same rule as NavLink: deeper paths (/applications/[id])
          // light no tab — the detail page is reachable from two of them.
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "py-3 text-center text-sm font-medium text-cobalt"
                  : "py-3 text-center text-sm font-medium text-ink-soft hover:text-cobalt"
              }
            >
              {t(key)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
