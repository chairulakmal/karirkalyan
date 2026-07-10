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
 *
 * With two locales the control is a toggle showing only the language you are
 * *not* reading, named in that language. Rendering the active one too would
 * restate what the surrounding page already says. A third locale turns this
 * into a menu — `target` would stop being a single value.
 */
export function LocaleSwitcher() {
  const t = useTranslations("locale");
  const active = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const target: Locale =
    routing.locales.find((locale) => locale !== active) ?? routing.defaultLocale;

  return (
    <button
      type="button"
      lang={target}
      // The visible label is a bare language name, which could be read as a
      // statement rather than an action; the accessible name supplies the verb.
      aria-label={t("switchTo", { language: t(target) })}
      onClick={() => router.replace(pathname, { locale: target })}
      className="text-ink-soft transition hover:text-cobalt"
    >
      {t(target)}
    </button>
  );
}
