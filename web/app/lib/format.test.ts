import { describe, it, expect, afterEach, vi } from "vitest";
import { isOverdue } from "./format";

/* The regression this file exists for: `isOverdue` used to derive "today" from
   the ambient clock, so the UTC server and the JST browser disagreed about it
   between 00:00 and 09:00 JST — the same follow-up rendering overdue on one
   side and not on the other, which is a hydration mismatch, not a cosmetic
   difference. Each case below fakes an instant inside that window and asserts
   the Tokyo answer, so an ambient-clock implementation fails here rather than
   in the morning. The suite runs under a `node` environment with no `TZ` set
   (CI is UTC), which is exactly the server's configuration. */

// 07:00 JST on 2026-07-29 — still 2026-07-28 in UTC. The whole bug lives here.
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

describe("isOverdue", () => {
  it("is false for no date", () => {
    at(MIDDAY_JST);
    expect(isOverdue(null)).toBe(false);
    expect(isOverdue(undefined)).toBe(false);
    expect(isOverdue("")).toBe(false);
  });

  it("is false for today and the future", () => {
    at(MIDDAY_JST);
    expect(isOverdue("2026-07-28")).toBe(false);
    expect(isOverdue("2026-07-29")).toBe(false);
  });

  it("is true for a past date", () => {
    at(MIDDAY_JST);
    expect(isOverdue("2026-07-27")).toBe(true);
  });

  it("reads yesterday-in-Tokyo as overdue before 09:00 JST, when UTC still calls it today", () => {
    at(EARLY_MORNING_JST);
    expect(isOverdue("2026-07-28")).toBe(true);
  });

  it("does not call the Tokyo today overdue in that same window", () => {
    at(EARLY_MORNING_JST);
    expect(isOverdue("2026-07-29")).toBe(false);
  });

  it("ignores the time part of a timestamp, comparing the date alone", () => {
    at(MIDDAY_JST);
    expect(isOverdue("2026-07-27T23:59:59+09:00")).toBe(true);
    expect(isOverdue("2026-07-28T00:00:00+09:00")).toBe(false);
  });
});
