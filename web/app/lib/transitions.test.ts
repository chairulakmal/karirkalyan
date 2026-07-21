import { describe, it, expect } from "vitest";
import { canRevive } from "./transitions";
import type { TransitionTable } from "./types";

// A faithful slice of the FSM the API serves: draft has a *forward* edge to
// applied, and the three closed states have a *revival* edge to it. That draft
// edge is the whole reason canRevive gates on "closed", not just "has an edge
// to applied".
const TABLE: TransitionTable = {
  states: ["wishlist", "draft", "applied", "phone_screen", "rejected", "ghosted", "withdrawn", "accepted"],
  entry_states: ["wishlist", "draft", "applied"],
  terminal_states: ["accepted", "declined", "archived"],
  active_states: ["wishlist", "draft", "applied", "phone_screen", "technical", "final_round", "offer"],
  transitions: {
    wishlist: ["draft"],
    draft: ["applied"],
    applied: ["phone_screen", "rejected", "ghosted"],
    phone_screen: ["technical", "rejected", "ghosted"],
    technical: [],
    final_round: [],
    offer: ["accepted"],
    rejected: ["applied"],
    ghosted: ["applied"],
    withdrawn: ["applied"],
    accepted: [],
    declined: [],
    archived: [],
  },
};

describe("canRevive", () => {
  it("is true for the closed states with an edge back to applied", () => {
    expect(canRevive("ghosted", TABLE)).toBe(true);
    expect(canRevive("rejected", TABLE)).toBe(true);
    expect(canRevive("withdrawn", TABLE)).toBe(true);
  });

  it("is false for draft, whose edge to applied is a forward move, not a revival", () => {
    // The exact case a naive transitions[status].includes("applied") would get wrong.
    expect(canRevive("draft", TABLE)).toBe(false);
  });

  it("is false for an active in-flight state", () => {
    expect(canRevive("applied", TABLE)).toBe(false);
    expect(canRevive("phone_screen", TABLE)).toBe(false);
  });

  it("is false for a terminal state with no way back", () => {
    expect(canRevive("accepted", TABLE)).toBe(false);
  });

  it("is false when the table did not arrive (empty active_states)", () => {
    const empty: TransitionTable = { ...TABLE, active_states: [] };
    expect(canRevive("ghosted", empty)).toBe(false);
  });
});
