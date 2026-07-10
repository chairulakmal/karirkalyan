import { defineRouting } from "next-intl/routing";

/**
 * English is unprefixed (`/dashboard`), Japanese is prefixed (`/ja/dashboard`).
 *
 * `as-needed` also makes `/en/*` self-correcting: next-intl 307s it to the
 * unprefixed path, so each page keeps exactly one canonical address rather than
 * answering on two. See SPEC.md → Frontend → i18n.
 */
export const routing = defineRouting({
  locales: ["en", "ja"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
