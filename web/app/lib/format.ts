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

export function statusLabel(s: Status): string {
  return STATUS_LABEL[s] ?? s;
}

export function statusBadgeClass(s: Status): string {
  return STATUS_CLASS[s] ?? "bg-dune/40 text-ink-soft ring-dune";
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
