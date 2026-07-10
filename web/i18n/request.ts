import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  // `requestLocale` is whatever matched the `[locale]` segment, which acts as a
  // catch-all — it can be `undefined` or an unknown string, so validate rather
  // than trust it.
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    // The API serialises dates in app time (Tokyo). Pinning the same zone here
    // stops a follow-up date rendering as the previous day for a user abroad.
    timeZone: "Asia/Tokyo",
  };
});
