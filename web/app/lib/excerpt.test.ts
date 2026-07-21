import { describe, it, expect } from "vitest";
import { excerpt } from "./excerpt";

describe("excerpt", () => {
  it("returns an empty string for null/undefined/blank", () => {
    expect(excerpt(null)).toBe("");
    expect(excerpt(undefined)).toBe("");
    expect(excerpt("   ")).toBe("");
  });

  it("returns short text unchanged", () => {
    expect(excerpt("Backend role, Ruby/Go", 80)).toBe("Backend role, Ruby/Go");
  });

  it("collapses newlines and runs of whitespace to single spaces", () => {
    expect(excerpt("Tech: React\n\nIndustry:  Fintech")).toBe("Tech: React Industry: Fintech");
  });

  it("truncates past the cap and appends an ellipsis", () => {
    const r = excerpt("abcdefghij", 5);
    expect(r).toBe("abcde…");
  });

  it("counts codepoints, so it does not cut a kanji mid-character", () => {
    // Ten kanji; a cap of 3 keeps exactly three whole characters.
    const r = excerpt("日本語能力試験一級二級三", 3);
    expect(r).toBe("日本語…");
    expect([...r]).toHaveLength(4); // three kanji + the ellipsis
  });
});
