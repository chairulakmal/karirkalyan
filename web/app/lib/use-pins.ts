"use client";

import { useCallback, useSyncExternalStore } from "react";
import { PINS_STORAGE_KEY, parsePins, serializePins, togglePin } from "./pins";
import type { ToggleResult } from "./pins";

/**
 * The storage half of dashboard pins (SPEC.md § Pinned applications). The rules,
 * the cap and the parsing live in `pins.ts` and are unit-tested there; this is
 * only the part that touches `localStorage` and React.
 *
 * It is a `useSyncExternalStore` subscription rather than a `useState` seeded in
 * an effect. localStorage *is* an external store, and the effect version has two
 * problems this one does not: it renders once with no pins and then immediately
 * again with them (a cascading render React's own lint rule flags), and it needs
 * a second effect to notice a write from another tab. Here both fall out of the
 * primitive: `getServerSnapshot` is what the server and the hydration pass read,
 * and the subscription covers this tab and every other one.
 *
 * Pins therefore still appear a beat after first paint, which is not a
 * limitation to work around but the only honest answer. Every route renders on
 * the server (the CSP nonce requires it) and the server cannot know what is in
 * this device's localStorage, so any markup it emitted about pins would be a
 * guess the client had to correct. For a reordering of at most three rows, that
 * is not worth a cookie to avoid.
 */

// One store per origin, so the module-level state is not shared with anything it
// should not be: there is exactly one pin set, under one key.
const listeners = new Set<() => void>();

// `getSnapshot` must return a referentially stable value while the underlying
// data is unchanged, or React re-renders forever. So the parse is cached against
// the raw string it came from, and a read that finds the same string hands back
// the same array.
let cachedRaw: string | null = null;
let cachedPins: number[] = [];

// Reading can throw: private-mode Safari and a full quota both do. A dashboard
// that will not render because a preference could not be read is a far worse bug
// than one with no pins, so every failure here reads as "no pins".
function readRaw(): string | null {
  try {
    return window.localStorage.getItem(PINS_STORAGE_KEY);
  } catch {
    return null;
  }
}

function getSnapshot(): number[] {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedPins = parsePins(raw);
  }
  return cachedPins;
}

// A stable empty array, not a fresh `[]`: this is read on the server and again
// during hydration, and a new identity each call is the same infinite-render
// trap as an uncached `getSnapshot`.
const NO_PINS: number[] = [];
function getServerSnapshot(): number[] {
  return NO_PINS;
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  // `storage` fires only in the *other* tabs, which is what makes it worth
  // listening to and also why it is not sufficient on its own: a write from this
  // tab is announced through `listeners` below. It also fires for every key on
  // the origin, which costs nothing, because a snapshot whose raw string did not
  // change returns the same array and React bails out of the re-render.
  window.addEventListener("storage", onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

/**
 * What a toggle did. The pure `ToggleResult` outcomes, plus the one this layer
 * can add: storage refused the write, so there is nothing to re-read and the
 * button would otherwise appear dead. Private-mode Safari and a full quota both
 * throw on `setItem`, and since the rendered state is read back *from* storage,
 * a swallowed failure means a control that does nothing and says nothing. That
 * is the failure mode the cap's toast exists to prevent, so it gets one too.
 */
export type PinOutcome = ToggleResult["outcome"] | "unavailable";

export function usePins(): {
  pins: number[];
  toggle: (id: number) => PinOutcome;
  clear: () => "cleared" | "unavailable";
} {
  const pins = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Returns the outcome synchronously, because the caller needs it: pinning and
  // unpinning are visible in the list the instant they happen, but a refused
  // fourth pin looks like a dead button unless the cap is spoken.
  const toggle = useCallback((id: number): PinOutcome => {
    const result = togglePin(getSnapshot(), id);
    if (result.outcome === "full") return result.outcome;
    try {
      window.localStorage.setItem(PINS_STORAGE_KEY, serializePins(result.pins));
    } catch {
      return "unavailable";
    }
    for (const listener of listeners) listener();
    return result.outcome;
  }, []);

  // The way out of a pin that can no longer be unpinned from its own row.
  // `toggle` needs the row on screen to reach the button; a pin whose
  // application was deleted has no row and never will, so without this the
  // hidden-pins note counts it forever and neither remedy the note names can
  // move it (SPEC.md § Pinned applications).
  //
  // It clears the whole set rather than one id because the note is the only
  // place it can be offered and the note does not know WHICH pins are missing
  // in a way the user could act on: the cap is three, so re-pinning is cheap.
  // `removeItem` rather than writing "[]", so a cleared set leaves no key
  // behind and `parsePins` reads the same nothing it reads on a fresh browser.
  const clear = useCallback((): "cleared" | "unavailable" => {
    try {
      window.localStorage.removeItem(PINS_STORAGE_KEY);
    } catch {
      return "unavailable";
    }
    for (const listener of listeners) listener();
    return "cleared";
  }, []);

  return { pins, toggle, clear };
}
