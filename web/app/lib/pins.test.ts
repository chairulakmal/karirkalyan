import { describe, it, expect } from "vitest";
import {
  MAX_PINS,
  hiddenPinCount,
  parsePins,
  serializePins,
  sortPinnedFirst,
  togglePin,
} from "./pins";

// A stand-in for the rows the list renders: `sortPinnedFirst` and
// `hiddenPinCount` only ever read `id`.
const row = (id: number) => ({ id });

describe("parsePins", () => {
  it("reads a well-formed array", () => {
    expect(parsePins("[3,1,2]")).toEqual([3, 1, 2]);
  });

  it("treats absent storage as no pins", () => {
    expect(parsePins(null)).toEqual([]);
    expect(parsePins(undefined)).toEqual([]);
    expect(parsePins("")).toEqual([]);
  });

  it("never throws on malformed JSON", () => {
    expect(parsePins("{oops")).toEqual([]);
    expect(parsePins("[1,2,")).toEqual([]);
  });

  it("rejects a payload that is not an array", () => {
    expect(parsePins('{"a":1}')).toEqual([]);
    expect(parsePins('"1,2,3"')).toEqual([]);
    expect(parsePins("42")).toEqual([]);
  });

  it("drops entries that are not positive safe integers", () => {
    expect(parsePins('[1,"2",null,3.5,-4,0,{},[],5]')).toEqual([1, 5]);
    expect(parsePins("[1e400]")).toEqual([]); // Infinity, via JSON
  });

  it("dedupes", () => {
    expect(parsePins("[7,7,8]")).toEqual([7, 8]);
  });

  it("truncates a hand-edited overlong array to the cap", () => {
    expect(parsePins("[1,2,3,4,5,6]")).toEqual([1, 2, 3]);
    expect(parsePins("[1,2,3,4,5,6]")).toHaveLength(MAX_PINS);
  });

  it("round-trips what serializePins writes", () => {
    expect(parsePins(serializePins([9, 4]))).toEqual([9, 4]);
  });
});

describe("togglePin", () => {
  it("appends a new pin at the end, so existing pins do not move", () => {
    expect(togglePin([5], 9)).toEqual({ pins: [5, 9], outcome: "pinned" });
  });

  it("removes a pin that is already set", () => {
    expect(togglePin([5, 9], 5)).toEqual({ pins: [9], outcome: "unpinned" });
  });

  it("refuses a fourth pin rather than evicting the oldest", () => {
    const full = [1, 2, 3];
    expect(togglePin(full, 4)).toEqual({ pins: full, outcome: "full" });
  });

  it("still unpins when the set is full, so the cap is never a trap", () => {
    expect(togglePin([1, 2, 3], 2)).toEqual({ pins: [1, 3], outcome: "unpinned" });
  });

  it("does not mutate the array it is given", () => {
    const pins = [1, 2];
    togglePin(pins, 3);
    togglePin(pins, 1);
    expect(pins).toEqual([1, 2]);
  });
});

describe("sortPinnedFirst", () => {
  it("hoists pinned rows in pin order, not list order", () => {
    const items = [row(1), row(2), row(3), row(4)];
    expect(sortPinnedFirst(items, [4, 2]).map((i) => i.id)).toEqual([4, 2, 1, 3]);
  });

  it("leaves the unpinned rows in the order they arrived", () => {
    const items = [row(1), row(2), row(3), row(4), row(5)];
    expect(sortPinnedFirst(items, [3]).map((i) => i.id)).toEqual([3, 1, 2, 4, 5]);
  });

  it("returns the list untouched when nothing is pinned", () => {
    const items = [row(1), row(2)];
    expect(sortPinnedFirst(items, [])).toBe(items);
  });

  it("ignores pins that are not in the rendered set", () => {
    // The filtered-out / not-yet-fetched case: the pin exists, the row does not.
    const items = [row(1), row(2)];
    expect(sortPinnedFirst(items, [99, 2]).map((i) => i.id)).toEqual([2, 1]);
  });

  it("does not mutate the array it is given", () => {
    const items = [row(1), row(2), row(3)];
    sortPinnedFirst(items, [3]);
    expect(items.map((i) => i.id)).toEqual([1, 2, 3]);
  });
});

describe("hiddenPinCount", () => {
  it("is zero when every pin is on screen", () => {
    expect(hiddenPinCount([row(1), row(2)], [1, 2])).toBe(0);
  });

  it("is zero when nothing is pinned", () => {
    expect(hiddenPinCount([row(1)], [])).toBe(0);
  });

  it("counts pins the current filter or page does not include", () => {
    expect(hiddenPinCount([row(1)], [1, 2, 3])).toBe(2);
    expect(hiddenPinCount([], [1, 2])).toBe(2);
  });
});
