import type { Status } from "./types";

const STATUS_LABEL: Record<Status, string> = {
  wishlist: "Wishlist",
  draft: "Draft",
  applied: "Applied",
  phone_screen: "Phone screen",
  technical: "Technical",
  final_round: "Final round",
  offer: "Offer",
  accepted: "Accepted",
  rejected: "Rejected",
  ghosted: "Ghosted",
  declined: "Declined",
  withdrawn: "Withdrawn",
  archived: "Archived",
};

/**
 * Status badge colours, mapped onto the Cobalt brand palette.
 *
 * - dune/ink-soft  → neutral / inactive (wishlist, draft, withdrawn, archived)
 * - cobalt         → in-pipeline (applied, phone_screen, technical, final_round)
 * - saffron        → celebratory (offer, accepted)
 * - red            → terminal-negative (rejected, ghosted, declined)
 */
const STATUS_CLASS: Record<Status, string> = {
  wishlist: "bg-dune/40 text-ink-soft ring-dune",
  draft: "bg-dune/40 text-ink-soft ring-dune",
  applied: "bg-cobalt/10 text-cobalt ring-cobalt/30",
  phone_screen: "bg-cobalt/10 text-cobalt ring-cobalt/30",
  technical: "bg-cobalt/10 text-cobalt ring-cobalt/30",
  final_round: "bg-cobalt/10 text-cobalt ring-cobalt/30",
  offer: "bg-saffron-2/40 text-[#7a4d10] ring-saffron",
  accepted: "bg-saffron text-midnight ring-saffron",
  rejected: "bg-red-100 text-red-800 ring-red-200",
  ghosted: "bg-red-50 text-red-700 ring-red-200",
  declined: "bg-red-50 text-red-700 ring-red-200",
  withdrawn: "bg-dune/60 text-ink-soft ring-dune",
  archived: "bg-dune/60 text-ink-soft ring-dune",
};

/**
 * One-line meaning for each status. Surfaced wherever the user reads or picks
 * a status (info bubble, confirm step, badge tooltips) so the FSM's vocabulary
 * is never a guess — "withdrawn" vs "declined" trips people up otherwise.
 */
const STATUS_DESCRIPTION: Record<Status, string> = {
  wishlist: "A job you've saved and might apply to — nothing sent yet.",
  draft: "You're preparing the application but haven't submitted it.",
  applied: "Application submitted — waiting to hear back.",
  phone_screen: "First call with a recruiter or hiring manager.",
  technical: "Technical interview or take-home assignment stage.",
  final_round: "Last interview stage before the company decides.",
  offer: "The company made an offer — the decision is yours now.",
  accepted: "You took their offer — the happy ending.",
  rejected: "The company decided not to move forward.",
  ghosted: "The company went silent and stopped responding.",
  declined: "You turned their offer down.",
  withdrawn: "You pulled out of the process yourself.",
  archived: "Closed and hidden from day-to-day tracking.",
};

// Mirrors ApplicationFSM::TERMINAL_STATES — no transitions out, ever.
export const PERMANENT_STATUSES: ReadonlySet<Status> = new Set([
  "accepted",
  "declined",
  "archived",
]);

// Statuses where a pending follow-up is actionable — a stale follow-up date on
// a closed application shouldn't shout "overdue".
export const ACTIVE_STATUSES: ReadonlySet<Status> = new Set([
  "wishlist",
  "draft",
  "applied",
  "phone_screen",
  "technical",
  "final_round",
  "offer",
]);

export function statusLabel(s: Status): string {
  return STATUS_LABEL[s];
}

export function statusBadgeClass(s: Status): string {
  return STATUS_CLASS[s];
}

export function statusDescription(s: Status): string {
  return STATUS_DESCRIPTION[s];
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

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const diffSec = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return RELATIVE.format(diffSec, "second");
  if (abs < 3600) return RELATIVE.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return RELATIVE.format(Math.round(diffSec / 3600), "hour");
  if (abs < 2592000) return RELATIVE.format(Math.round(diffSec / 86400), "day");
  if (abs < 31536000) return RELATIVE.format(Math.round(diffSec / 2592000), "month");
  return RELATIVE.format(Math.round(diffSec / 31536000), "year");
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
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

/** Maps a URL host (the dashboard's `by_source` key) to a display label. */
export function jobBoardLabel(host: string): string {
  if (host === NO_BOARD) return "No link";
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
