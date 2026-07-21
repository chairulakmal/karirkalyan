import { describe, it, expect } from "vitest";
import {
  computeOverlap,
  toJstInputValue,
  formatJstDateTime,
  interviewIsAntisocial,
} from "./timezone";

// A fixed instant in a period where the US is on daylight time (so PDT = UTC-7,
// EDT = UTC-4) and JST is its usual UTC+9. Keeps the offsets deterministic.
const SUMMER = new Date("2026-07-01T00:00:00Z");
// And a winter instant, when the US is on standard time (PST = UTC-8).
const WINTER = new Date("2026-01-15T00:00:00Z");

describe("computeOverlap", () => {
  it("returns null when there is no company zone", () => {
    expect(computeOverlap(null, 4, SUMMER)).toBeNull();
  });

  it("puts Tokyo 16h ahead of US Pacific in summer (PDT)", () => {
    const r = computeOverlap("America/Los_Angeles", null, SUMMER)!;
    expect(r.offsetHoursFromTokyo).toBe(16);
    // Their 09:00 PDT is 01:00 JST; 18:00 is 10:00 JST.
    expect(r.jstWorkdayStart).toBe(1);
    expect(r.jstWorkdayEnd).toBe(10);
  });

  it("tracks DST: US Pacific is 17h behind Tokyo in winter (PST)", () => {
    const r = computeOverlap("America/Los_Angeles", null, WINTER)!;
    expect(r.offsetHoursFromTokyo).toBe(17);
  });

  it("flags a 4h overlap with US Pacific as not survivable (only 3 livable hours)", () => {
    // 09:00-18:00 PDT maps to 01:00-10:00 JST; only 07,08,09 are livable, so a
    // required 4h overlap cannot fit the livable band.
    const r = computeOverlap("America/Los_Angeles", 4, SUMMER)!;
    expect(r.survivable).toBe(false);
  });

  it("treats UK as survivable for a 4h overlap", () => {
    // 09:00-18:00 BST is 17:00-02:00 JST; 17:00-23:00 (6 livable hours) holds 4.
    const r = computeOverlap("Europe/London", 4, SUMMER)!;
    expect(r.survivable).toBe(true);
  });

  it("with no stated overlap, needs only one livable hour to avoid the flag", () => {
    const r = computeOverlap("America/Los_Angeles", null, SUMMER)!;
    expect(r.survivable).toBe(true);
  });

  it("is trivially survivable for a same-zone (Tokyo) company", () => {
    const r = computeOverlap("Asia/Tokyo", 8, SUMMER)!;
    expect(r.offsetHoursFromTokyo).toBe(0);
    expect(r.survivable).toBe(true);
  });

  it("flags crossesMidnight only when the JST band actually wraps", () => {
    // Berlin summer 09:00-18:00 is 16:00-01:00 JST: end (01:00) < start (16:00).
    expect(computeOverlap("Europe/Berlin", null, SUMMER)!.crossesMidnight).toBe(true);
    // LA 09:00-18:00 is 01:00-10:00 JST: end after start, no wrap.
    expect(computeOverlap("America/Los_Angeles", null, SUMMER)!.crossesMidnight).toBe(false);
    // Same-zone Tokyo never wraps.
    expect(computeOverlap("Asia/Tokyo", null, SUMMER)!.crossesMidnight).toBe(false);
  });
});

describe("interview time helpers (JST)", () => {
  it("renders a UTC instant as its JST datetime-local value", () => {
    // 06:00 UTC is 15:00 JST.
    expect(toJstInputValue("2026-07-25T06:00:00Z")).toBe("2026-07-25T15:00");
  });

  it("formats a UTC instant as a JST wall-clock", () => {
    expect(formatJstDateTime("2026-07-25T06:00:00Z")).toBe("2026-07-25 15:00");
  });

  it("flags an interview that lands before 07:00 JST", () => {
    // 18:00 UTC is 03:00 JST next day: the 3am call.
    expect(interviewIsAntisocial("2026-07-24T18:00:00Z")).toBe(true);
  });

  it("does not flag a daytime-JST interview", () => {
    // 06:00 UTC is 15:00 JST.
    expect(interviewIsAntisocial("2026-07-25T06:00:00Z")).toBe(false);
  });
});
