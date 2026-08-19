import { describe, it, expect, afterEach, vi } from "vitest";
import { planAgenda, AGENDA_WINDOW_DAYS } from "./agenda";
import type { AgendaItem } from "./types";

/* The Upcoming agenda's window, which decides what the dashboard leads with.
   Two things are worth a test rather than a comment: an overdue item must stay
   inside the window however old it is (it is the most actionable row on the
   page), and the horizon is a Tokyo calendar date, so the UTC server and the
   JST browser have to agree about it or the two render different lists. The
   suite runs under a `node` environment with no `TZ` set (CI is UTC), which is
   exactly the server's configuration. */

// 07:00 JST on 2026-07-29, still 2026-07-28 in UTC: the window where a
// wall-clock horizon and a Tokyo one disagree.
const EARLY_MORNING_JST = new Date("2026-07-28T22:00:00Z");
// 11:00 JST on 2026-07-28, when every zone agrees on the date.
const MIDDAY_JST = new Date("2026-07-28T02:00:00Z");

afterEach(() => {
  vi.useRealTimers();
});

function at(instant: Date) {
  vi.useFakeTimers();
  vi.setSystemTime(instant);
}

function item(type: AgendaItem["type"], iso: string): AgendaItem {
  return { type, at: iso, application_id: 1, company: "Mercari", role: "Backend", status: "applied" };
}

describe("planAgenda", () => {
  it("keeps items inside the window and folds the rest into `later`", () => {
    at(MIDDAY_JST);
    const soon = item("follow_up", "2026-08-01");
    const far = item("interview", "2026-10-15T14:00:00+09:00");
    const { withinWindow, later } = planAgenda([far, soon]);
    expect(withinWindow).toEqual([soon]);
    expect(later).toEqual([far]);
  });

  it("includes the last day of the window and excludes the first day past it", () => {
    at(MIDDAY_JST); // Tokyo 2026-07-28, so the horizon is 2026-08-04.
    const lastDay = item("follow_up", "2026-08-04");
    const dayAfter = item("follow_up", "2026-08-05");
    const { withinWindow, later } = planAgenda([lastDay, dayAfter]);
    expect(withinWindow).toEqual([lastDay]);
    expect(later).toEqual([dayAfter]);
    expect(AGENDA_WINDOW_DAYS).toBe(7);
  });

  it("has no lower bound: an overdue item stays in the window however old", () => {
    at(MIDDAY_JST);
    const ancient = item("follow_up", "2026-01-04");
    expect(planAgenda([ancient]).withinWindow).toEqual([ancient]);
  });

  it("exempts the residence clock, which the API already windows at 90 days", () => {
    at(MIDDAY_JST);
    const residence = { ...item("residence", "2026-10-20"), application_id: null };
    expect(planAgenda([residence]).withinWindow).toEqual([residence]);
    expect(planAgenda([residence]).later).toEqual([]);
  });

  it("measures the horizon in Tokyo, not in the server's zone", () => {
    // 07:00 JST on the 29th. Tokyo's horizon is 2026-08-05; a UTC one would
    // still be on the 28th and so would push this item out of the window.
    at(EARLY_MORNING_JST);
    const edge = item("follow_up", "2026-08-05");
    expect(planAgenda([edge]).withinWindow).toEqual([edge]);
  });

  it("sorts by absolute distance, so an overdue item outranks a nearer future one", () => {
    at(MIDDAY_JST);
    const overdue = item("follow_up", "2026-07-27"); // yesterday
    const future = item("follow_up", "2026-08-02"); // five days out
    expect(planAgenda([future, overdue]).withinWindow).toEqual([overdue, future]);
  });
});
