"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";

/**
 * Swaps locale while staying on the current page. `usePathname` from
 * `@/i18n/navigation` returns the locale-stripped path, and `router.replace`
 * re-applies the target locale's prefix — so `/ja/applications/7` and
 * `/applications/7` map onto each other without string surgery here.
 *
 * `replace`, not `push`: switching language is a correction, not a step in the
 * visitor's history.
 */
export function LocaleSwitcher() {
  const t = useTranslations("locale");
  const active = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="flex items-center gap-1" role="group" aria-label={t("switchAria")}>
      {routing.locales.map((locale, index) => (
        <span key={locale} className="flex items-center gap-1">
          {index > 0 ? <span aria-hidden className="text-dune">/</span> : null}
          <button
            type="button"
            lang={locale}
            aria-current={locale === active ? "true" : undefined}
            disabled={locale === active}
            onClick={() => router.replace(pathname, { locale: locale as Locale })}
            className={
              locale === active
                ? "font-medium text-cobalt"
                : "text-ink-soft hover:text-cobalt focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cobalt"
            }
          >
            {t(locale)}
          </button>
        </span>
      ))}
    </div>
  );
}
