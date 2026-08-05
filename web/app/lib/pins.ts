// Dashboard pins: the pure half. Up to three applications can be hoisted to the
// top of the dashboard list, and the pin set lives in localStorage rather than in
// the database: a pin is a transient attention marker, not a fact about the
// application. See SPEC.md § Pinned applications for why it is device-local, and
// `use-pins.ts` for the storage side.
//
// Everything here is deliberately DOM-free so it is testable through the Vitest
// seam without a browser, the same split `excerpt.ts` set.

export const MAX_PINS = 3;

// Versioned in the key rather than inside the payload: if the shape ever changes,
// a new key starts clean instead of asking `parsePins` to migrate a format it
// would then have to keep understanding forever.
export const PINS_STORAGE_KEY = "kk.pins.v1";

/**
 * Reads the stored pin set, treating anything it does not recognise as "no pins".
 *
 * localStorage is user-writable and outlives every deploy, so a payload this code
 * has stopped recognising is a real case, not a hypothetical. The one thing it
 * must never do is throw: the failure mode has to be a dashboard with no pins,
 * never a dashboard that does not render.
 */
export function parsePins(raw: string | null | undefined): number[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const ids: number[] = [];
  for (const value of parsed) {
    // Application ids are bigserial: positive integers. `Number.isSafeInteger`
    // rejects floats, NaN, Infinity and anything past 2^53 in one test; the rest
    // (strings, null, objects) fails the typeof.
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) continue;
    if (ids.includes(value)) continue;
    ids.push(value);
    if (ids.length === MAX_PINS) break;
  }
  return ids;
}

export function serializePins(pins: number[]): string {
  return JSON.stringify(pins);
}

export type ToggleResult =
  | { pins: number[]; outcome: "pinned" | "unpinned" }
  // The cap refuses rather than evicting the oldest pin: with a set this small
  // the user knows what is in it, so dropping one unasked reads as the app
  // losing a pin. `pins` comes back unchanged so the caller can toast and stop.
  | { pins: number[]; outcome: "full" };

/**
 * Pins an id, or unpins it if it is already pinned. New pins go on the *end*, so
 * the hoisted order matches the order they were pinned in and an existing pin
 * never moves because a second one was added.
 */
export function togglePin(pins: number[], id: number): ToggleResult {
  if (pins.includes(id)) {
    return { pins: pins.filter((pinned) => pinned !== id), outcome: "unpinned" };
  }
  if (pins.length >= MAX_PINS) return { pins, outcome: "full" };
  return { pins: [...pins, id], outcome: "pinned" };
}

/**
 * Hoists the pinned rows to the front, in pin order, leaving every other row in
 * the order it arrived in.
 *
 * This reorders *what is already rendered* and fetches nothing, which is what
 * keeps a pin from contradicting the filter chips above it or claiming a row from
 * a page that was never loaded (SPEC.md § Pinned applications). It is also the
 * one place the list re-sorts across pages, and the exemption is narrow on
 * purpose: at most three named rows move, and they move to a fixed position, so
 * nothing shifts unpredictably under the reader the way a full re-sort of
 * accumulated pages would.
 */
export function sortPinnedFirst<T extends { id: number }>(items: T[], pins: number[]): T[] {
  if (pins.length === 0) return items;
  const rank = new Map(pins.map((id, i) => [id, i]));
  const hoisted: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    (rank.has(item.id) ? hoisted : rest).push(item);
  }
  hoisted.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  return [...hoisted, ...rest];
}

/**
 * How many pins point at something the list is not currently showing: filtered
 * out, on a page "Load more" has not reached, or gone from the account
 * entirely.
 *
 * All three are silent by construction, and a pin that is merely off-page is
 * indistinguishable from a pin that was lost unless the list says so.
 *
 * The third case is why the caller must offer a way to unpin from here. A
 * deleted application leaves an id that no fetch can ever return, so a note
 * that only says "clear the filters, or load more" names two remedies that
 * cannot work and the count never falls. Nothing prunes this set on its own:
 * pruning would need proof the whole unfiltered list is loaded, which the
 * cursor pagination cannot cheaply give, and guessing wrong silently discards
 * a pin the user made.
 */
export function hiddenPinCount(items: { id: number }[], pins: number[]): number {
  if (pins.length === 0) return 0;
  const shown = new Set(items.map((item) => item.id));
  return pins.filter((id) => !shown.has(id)).length;
}
