import type { AgendaItem } from "./types";

/*
 * What the Upcoming agenda is allowed to lead with: the week ahead, plus
 * anything already overdue.
 *
 * The API sends every dated commitment it has (SPEC.md § The dashboard
 * payload), and the dashboard's only defence against a long agenda used to be
 * the three-row cap. That is the wrong filter on its own: an interview eleven
 * weeks out is not something to do this week, and it was taking a slot from
 * the follow-up that is. So the window decides which items are *eligible* to
 * be seen, and the cap still decides how many of those fit above the fold.
 *
 * Two boundaries, both deliberate:
 *
 * - **There is no lower bound.** Anything in the past is in the window however
 *   old it is, because an overdue follow-up is the most actionable row on the
 *   page; dropping it out the bottom is the one failure this section cannot
 *   afford.
 * - **`residence` is exempt.** A Certificate of Eligibility takes 63 days
 *   (`Visa::COE_LEAD_TIME_DAYS`), so a residence clock that first appears a
 *   week before expiry appears too late to act on: lead time is the whole
 *   reason the API windows it at 90 (`AGENDA_RESIDENCE_WINDOW_DAYS`). It is at
 *   most one row and it is already windowed once on the server, so exempting
 *   it costs a row and buys the two months of notice the feature exists for.
 *
 * Nothing is dropped: whatever falls outside the window sorts into `later`,
 * and the section folds it behind "Show more".
 */
export const AGENDA_WINDOW_DAYS = 7;

/*
 * "Today" is Tokyo's today, for the reason `isOverdue` documents at length:
 * this runs on the server (the `web` container is UTC) and again in the
 * browser (JST), and a wall-clock horizon would put an item inside the window
 * on one side and outside it on the other every morning before 09:00 JST.
 * Since the two sides then render different lists, that is a hydration
 * mismatch rather than a cosmetic difference. `en-CA` formats as `YYYY-MM-DD`,
 * the shape a string comparison against `at` needs; the API serialises every
 * agenda item in Tokyo, so both sides of the `<=` are Tokyo calendar dates.
 */
const tokyoDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" });

const DAY_MS = 24 * 60 * 60 * 1000;

// Absolute distance from now, in ms. Ranks agenda items by proximity to today
// regardless of whether they're overdue (past) or upcoming (future).
function distanceFromNow(iso: string): number {
  return Math.abs(new Date(iso).getTime() - Date.now());
}

/*
 * The agenda, sorted closest-to-now first (by absolute distance, so a
 * week-overdue follow-up outranks an interview three months out) and split at
 * the window above. Display-only: the server's chronological ordering and its
 * `AGENDA_LIMIT` are unchanged on the wire.
 */
export function planAgenda(items: AgendaItem[]): { withinWindow: AgendaItem[]; later: AgendaItem[] } {
  const horizon = tokyoDate.format(new Date(Date.now() + AGENDA_WINDOW_DAYS * DAY_MS));
  const sorted = [...items].sort((a, b) => distanceFromNow(a.at) - distanceFromNow(b.at));

  const withinWindow: AgendaItem[] = [];
  const later: AgendaItem[] = [];
  for (const item of sorted) {
    if (item.type === "residence" || item.at.slice(0, 10) <= horizon) {
      withinWindow.push(item);
    } else {
      later.push(item);
    }
  }
  return { withinWindow, later };
}
