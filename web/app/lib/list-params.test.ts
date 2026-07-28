import { describe, expect, it } from "vitest";
import { LIST_PARAMS, pickListParams } from "./list-params";

// The bug this file exists to prevent: `q` shipped as a list filter in v1.11.0
// and the BFF route handler was never taught about it, so every typed search
// silently returned unfiltered results. The regression guard is the first test
// below: every param the API accepts must survive the hop.

describe("pickListParams", () => {
  it("forwards every param in the contract, q included", () => {
    const source = new URLSearchParams({
      after: "42",
      limit: "25",
      status: "applied,offer",
      company: "Mercari",
      source: "linkedin",
      japanese_level: "n2",
      q: "backend",
    });

    const picked = pickListParams(source);

    for (const name of LIST_PARAMS) {
      expect(picked.get(name), `${name} must survive the BFF hop`).toBe(source.get(name));
    }
  });

  it("defaults limit but never invents other params", () => {
    const picked = pickListParams(new URLSearchParams());
    expect(picked.get("limit")).toBe("10");
    expect([...picked.keys()]).toEqual(["limit"]);
  });

  it("keeps a caller-supplied limit", () => {
    expect(pickListParams(new URLSearchParams({ limit: "50" })).get("limit")).toBe("50");
  });

  it("drops params outside the contract", () => {
    const picked = pickListParams(
      new URLSearchParams({ q: "acme", user_id: "7", order: "created_at" }),
    );
    expect(picked.get("q")).toBe("acme");
    expect(picked.has("user_id")).toBe(false);
    expect(picked.has("order")).toBe(false);
  });

  it("treats an empty value as absent, so an empty box is not a search", () => {
    const picked = pickListParams(new URLSearchParams({ q: "", company: "" }));
    expect(picked.has("q")).toBe(false);
    expect(picked.has("company")).toBe(false);
  });
});
