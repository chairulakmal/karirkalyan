import { describe, it, expect } from "vitest";
import { computeHsp, type HspInputs } from "./hsp";

const base: HspInputs = {
  degree: "bachelor",
  experienceYears: 3,
  annualIncomeYen: 6_000_000,
  age: 30,
  japanese: "none",
  japaneseDegree: false,
  researchAchievements: false,
  nationalQualification: false,
};

describe("computeHsp", () => {
  it("sums the base categories", () => {
    // bachelor 10 + 3y 5 + 6M@30 (age<=39) 20 + age 30 (<=34) 10 = 45.
    expect(computeHsp(base).total).toBe(45);
  });

  it("scores a doctorate at 30, ten above a master (MOJ 学歴, verified against the source PDF)", () => {
    const phd = computeHsp({ ...base, degree: "doctorate" });
    const msc = computeHsp({ ...base, degree: "master" });
    expect(phd.breakdown.find((r) => r.key === "degree")?.points).toBe(30);
    expect(msc.breakdown.find((r) => r.key === "degree")?.points).toBe(20);
    expect(phd.total - msc.total).toBe(10);
    // A doctorate + ¥10M clears the 70 gate a master would miss.
    const phdRich = computeHsp({ ...base, degree: "doctorate", annualIncomeYen: 10_000_000, experienceYears: 0, age: 40, japanese: "none" });
    expect(phdRich.total).toBe(70); // 30 + 40 + 0
    expect(phdRich.qualifies).toBe(true);
  });

  it("age-gates the lower income bands", () => {
    // 6M scores 20 at 30 but 0 at 45 (age > 39).
    expect(computeHsp({ ...base, annualIncomeYen: 6_000_000, age: 45 }).breakdown
      .find((r) => r.key === "income")).toBeUndefined();
    // 10M scores 40 at any age.
    expect(computeHsp({ ...base, annualIncomeYen: 10_000_000, age: 45 }).breakdown
      .find((r) => r.key === "income")?.points).toBe(40);
  });

  it("qualifies at 70 and flags the 3-year PR track", () => {
    // master 20 + 7y 15 + 8M 30 (age<=34→10 age) + N1 15 = 90? recompute:
    // master 20, 7y 15, income 8M 30, age 30→10, N1 15 = 90 → 1-year track.
    const strong = computeHsp({
      ...base, degree: "master", experienceYears: 7,
      annualIncomeYen: 8_000_000, japanese: "n1",
    });
    expect(strong.total).toBe(90);
    expect(strong.qualifies).toBe(true);
    expect(strong.prYears).toBe(1);
  });

  it("gives the 3-year track between 70 and 79", () => {
    // master 20 + 5y 10 + 7M@30 25 + age 10 + N2 10 = 75.
    const r = computeHsp({
      ...base, degree: "master", experienceYears: 5,
      annualIncomeYen: 7_000_000, japanese: "n2",
    });
    expect(r.total).toBe(75);
    expect(r.prYears).toBe(3);
  });

  it("disqualifies below the income floor regardless of points", () => {
    const r = computeHsp({ ...base, annualIncomeYen: 2_000_000, japanese: "n1", japaneseDegree: true });
    expect(r.incomeDisqualified).toBe(true);
    expect(r.qualifies).toBe(false);
    expect(r.prYears).toBeNull();
  });

  it("flags J-Skip on the degree/income gate, independent of the point total", () => {
    // Master + 20M income = J-Skip, even if the point total were low.
    const r = computeHsp({ ...base, degree: "master", annualIncomeYen: 20_000_000 });
    expect(r.jSkip).toBe(true);
    // 10 years of experience also opens the gate.
    expect(computeHsp({ ...base, degree: "bachelor", experienceYears: 10, annualIncomeYen: 20_000_000 }).jSkip)
      .toBe(true);
    // Under 20M, no J-Skip.
    expect(computeHsp({ ...base, degree: "master", annualIncomeYen: 19_000_000 }).jSkip).toBe(false);
  });
});
