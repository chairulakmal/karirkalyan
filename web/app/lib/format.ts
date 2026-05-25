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

// Tailwind classes keyed by status family — kept short on purpose.
const STATUS_CLASS: Record<Status, string> = {
  wishlist: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  draft: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  applied: "bg-sky-100 text-sky-800 ring-sky-200",
  phone_screen: "bg-amber-100 text-amber-800 ring-amber-200",
  technical: "bg-amber-100 text-amber-800 ring-amber-200",
  final_round: "bg-amber-100 text-amber-800 ring-amber-200",
  offer: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  accepted: "bg-emerald-200 text-emerald-900 ring-emerald-300",
  rejected: "bg-rose-100 text-rose-800 ring-rose-200",
  ghosted: "bg-rose-100 text-rose-800 ring-rose-200",
  declined: "bg-rose-100 text-rose-800 ring-rose-200",
  withdrawn: "bg-zinc-200 text-zinc-700 ring-zinc-300",
  archived: "bg-zinc-200 text-zinc-700 ring-zinc-300",
};

export function statusLabel(s: Status): string {
  return STATUS_LABEL[s] ?? s;
}

export function statusBadgeClass(s: Status): string {
  return STATUS_CLASS[s] ?? "bg-zinc-100 text-zinc-700 ring-zinc-200";
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
