import type { Status } from "./types";

/*
 * Status *labels* and *descriptions* are not here — they live in
 * `messages/{en,ja}.json` under the `status` namespace, read with
 * `useTranslations("status")` in a client component or `getTranslations("status")`
 * in a server one. Keeping an English copy here as well would give the FSM's
 * vocabulary two sources of truth. Only the untranslatable part remains: the
 * badge palette, which is a brand mapping rather than an FSM fact — no set of
 * states lives here, because ApplicationFSM owns those and /transitions serves
 * them.
 */

/**
 * Status badge colours, mapped onto the Cobalt brand palette.
 *
 * - dune/ink-soft  → neutral / inactive (wishlist, draft, withdrawn, archived)
 * - cobalt         → in-pipeline (applied, phone_screen, technical, final_round)
 * - saffron        → celebratory (offer, accepted)
 * - danger         → terminal-negative (rejected, ghosted, declined)
 */
const STATUS_CLASS: Record<Status, string> = {
  wishlist: "bg-dune/40 text-ink-soft ring-dune",
  draft: "bg-dune/40 text-ink-soft ring-dune",
  applied: "bg-cobalt/10 text-cobalt ring-cobalt/30",
  phone_screen: "bg-cobalt/10 text-cobalt ring-cobalt/30",
  technical: "bg-cobalt/10 text-cobalt ring-cobalt/30",
  final_round: "bg-cobalt/10 text-cobalt ring-cobalt/30",
  offer: "bg-saffron-2/40 text-saffron-ink ring-saffron",
  accepted: "bg-saffron text-midnight ring-saffron",
  rejected: "bg-danger/15 text-danger ring-danger/30",
  ghosted: "bg-danger/10 text-danger ring-danger/30",
  declined: "bg-danger/10 text-danger ring-danger/30",
  withdrawn: "bg-dune/60 text-ink-soft ring-dune",
  archived: "bg-dune/60 text-ink-soft ring-dune",
};

export function statusBadgeClass(s: Status): string {
  return STATUS_CLASS[s];
}

/**
 * True when a follow-up's calendar date is before today. Compares the date
 * part as a string (server serialises in app time, Tokyo) so no timezone
 * arithmetic can shift the day.
 */
export function isOverdue(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return iso.slice(0, 10) < today;
}

/*
 * `locale` is typed as a plain string rather than the `Locale` union: every
 * caller gets it from next-intl's `useLocale()`/`getLocale()`, which are typed
 * `string` unless the library's `AppConfig` is augmented — and `Intl` takes a
 * string anyway. next-intl has already rejected anything outside `routing.locales`
 * before a component renders, so narrowing here would only buy casts.
 */

// Intl formatters are expensive to construct and there are only two locales, so
// build each one once on first use rather than per render.
const relativeFormatters = new Map<string, Intl.RelativeTimeFormat>();

function relative(locale: string): Intl.RelativeTimeFormat {
  let f = relativeFormatters.get(locale);
  if (!f) {
    f = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    relativeFormatters.set(locale, f);
  }
  return f;
}

export function timeAgo(iso: string | null | undefined, locale: string): string {
  if (!iso) return "";
  const r = relative(locale);
  const then = new Date(iso).getTime();
  const diffSec = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return r.format(diffSec, "second");
  if (abs < 3600) return r.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return r.format(Math.round(diffSec / 3600), "hour");
  if (abs < 2592000) return r.format(Math.round(diffSec / 86400), "day");
  if (abs < 31536000) return r.format(Math.round(diffSec / 2592000), "month");
  return r.format(Math.round(diffSec / 31536000), "year");
}

/**
 * How long the board's triage card has sat where it is, from the server's
 * `days_in_stage`. Reuses `relative` (the same Intl.RelativeTimeFormat engine
 * timeAgo uses) rather than inventing a second duration format; it just takes
 * the day count directly, since the API already did the COALESCE-against-now
 * arithmetic server-side (the sort key must be that server field, not a client
 * guess). `numeric: "auto"` gives "today"/"yesterday" for 0 and 1.
 */
export function stageAge(days: number, locale: string): string {
  return relative(locale).format(-days, "day");
}

export function formatDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    // The API serialises in app time (Tokyo), and a date-only field like
    // `follow_up_at` parses as UTC midnight. Without pinning the zone, a viewer
    // west of UTC sees the previous day — and `isOverdue` above, which compares
    // date strings, would then disagree with what is on screen.
    timeZone: "Asia/Tokyo",
  });
}

// Sentinel for applications with no link — must match Ruby's JobBoard::NONE.
export const NO_BOARD = "(none)";

// Friendly names for hosts we recognise. Anything else falls back to the bare
// host, so the filter still works for boards/companies not listed here.
const BOARD_LABELS: Record<string, string> = {
  "linkedin.com": "LinkedIn",
  "tokyodev.com": "TokyoDev",
  "japan-dev.com": "Japan Dev",
  "wantedly.com": "Wantedly",
  "indeed.com": "Indeed",
  "jp.indeed.com": "Indeed",
  "glassdoor.com": "Glassdoor",
  "greenhouse.io": "Greenhouse",
  "boards.greenhouse.io": "Greenhouse",
  "lever.co": "Lever",
  "jobs.lever.co": "Lever",
  "gaijinpot.com": "GaijinPot",
  "daijob.com": "Daijob",
};

/**
 * Maps a URL host (the dashboard's `by_source` key) to a display label.
 *
 * The board names are brands and stay untranslated. Only the `NO_BOARD`
 * sentinel needs words, so the caller passes its localized label in rather than
 * this module reaching for a message catalog.
 */
export function jobBoardLabel(host: string, noBoardLabel: string): string {
  if (host === NO_BOARD) return noBoardLabel;
  return BOARD_LABELS[host] ?? host;
}

/**
 * A readable label for a link: drops the protocol, a leading "www.", the query
 * string, and the hash — the noise that makes tracking-laden job URLs ugly —
 * keeping host + path. Truncated so it never blows out the layout. Always keep
 * the original URL as the anchor's href (and title); this is display only.
 * Falls back to the raw string if it isn't a parseable URL.
 */
export function prettyUrl(raw: string, maxLength = 48): string {
  let display: string;
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname.replace(/\/$/, ""); // drop trailing slash
    display = host + path;
  } catch {
    display = raw;
  }
  return display.length > maxLength ? `${display.slice(0, maxLength - 1)}…` : display;
}
