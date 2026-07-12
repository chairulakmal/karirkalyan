import type { MetadataRoute } from "next";
import { getPathname } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";

const BASE_URL = "https://kk.chairulakmal.com";

// Only the pages a signed-out crawler can reach. Everything behind the session
// cookie is a 307 to /sign-in and has no business here.
const ROUTES = [
  { href: "/", changeFrequency: "monthly", priority: 1 },
  { href: "/about", changeFrequency: "monthly", priority: 0.8 },
  { href: "/docs", changeFrequency: "monthly", priority: 0.8 },
  { href: "/privacy", changeFrequency: "yearly", priority: 0.5 },
  { href: "/terms", changeFrequency: "yearly", priority: 0.5 },
  { href: "/sign-in", changeFrequency: "yearly", priority: 0.5 },
] as const satisfies ReadonlyArray<{
  href: string;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
  priority: number;
}>;

// getPathname applies the locale prefix rule, so `en` stays unprefixed and `ja`
// gains `/ja`. Hardcoding the prefixes here would be a second source of truth.
const absolute = (href: string, locale: Locale) => `${BASE_URL}${getPathname({ href, locale })}`;

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map(({ href, changeFrequency, priority }) => ({
    // The canonical entry is the default locale; `alternates` declares the rest,
    // which is what emits the hreflang links. x-default points crawlers without
    // a language preference at English.
    url: absolute(href, routing.defaultLocale),
    changeFrequency,
    priority,
    alternates: {
      languages: {
        ...Object.fromEntries(routing.locales.map((locale) => [locale, absolute(href, locale)])),
        "x-default": absolute(href, routing.defaultLocale),
      },
    },
  }));
}
