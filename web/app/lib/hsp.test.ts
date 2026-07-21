import { describe, it, expect } from "vitest";
import { computeHsp, HSP_THRESHOLD, type HspInputs } from "./hsp";

const base: HspInputs = {
  degree: "bachelor",
  experienceYears: 3,
  annualIncomeYen: 6_000_000,
  age: 30,
  japanese: "none",
  multipleDegrees: false,
  researchAchievements: false,
  nationalQualifications: 0,
  innovationOrg: false,
  innovationSme: false,
  smeRnd: false,
  foreignQualification: false,
  japaneseDegree: false,
  growthField: false,
  topUniversity: false,
  training: false,
  hswOrg: false,
};

const points = (r: ReturnType<typeof computeHsp>, key: string) =>
  r.breakdown.find((row) => row.key === key)?.points;

describe("computeHsp", () => {
  it("sums the base categories", () => {
    // bachelor 10 + 3y 5 + 6M@30 (age<=39) 20 + age 30 (<=34) 10 = 45.
    expect(computeHsp(base).total).toBe(45);
  });

  it("scores a doctorate at 30, ten above a master (MOJ 学歴, verified against the source PDF)", () => {
    const phd = computeHsp({ ...base, degree: "doctorate" });
    const msc = computeHsp({ ...base, degree: "master" });
    expect(points(phd, "degree")).toBe(30);
    expect(points(msc, "degree")).toBe(20);
    expect(phd.total - msc.total).toBe(10);
    // A doctorate + ¥10M clears the 70 gate a master would miss.
    const phdRich = computeHsp({ ...base, degree: "doctorate", annualIncomeYen: 10_000_000, experienceYears: 0, age: 40, japanese: "none" });
    expect(phdRich.total).toBe(70); // 30 + 40 + 0
    expect(phdRich.qualifies).toBe(true);
  });

  it("age-gates the lower income bands", () => {
    // 6M scores 20 at 30 but 0 at 45 (age > 39).
    expect(points(computeHsp({ ...base, annualIncomeYen: 6_000_000, age: 45 }), "income")).toBeUndefined();
    // 10M scores 40 at any age.
    expect(points(computeHsp({ ...base, annualIncomeYen: 10_000_000, age: 45 }), "income")).toBe(40);
  });

  it("qualifies at 70 and flags the 3-year PR track", () => {
    // master 20 + 7y 15 + 8M 30 (age<=34→10 age) + N1 15 = 90 → 1-year track.
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

  it("scores every engineer bonus point at its table value", () => {
    expect(points(computeHsp({ ...base, multipleDegrees: true }), "multipleDegrees")).toBe(5);
    expect(points(computeHsp({ ...base, researchAchievements: true }), "research")).toBe(15);
    expect(points(computeHsp({ ...base, innovationOrg: true }), "innovationOrg")).toBe(10);
    expect(points(computeHsp({ ...base, smeRnd: true }), "smeRnd")).toBe(5);
    expect(points(computeHsp({ ...base, foreignQualification: true }), "foreignQualification")).toBe(5);
    expect(points(computeHsp({ ...base, japaneseDegree: true }), "japaneseDegree")).toBe(10);
    expect(points(computeHsp({ ...base, growthField: true }), "growthField")).toBe(10);
    expect(points(computeHsp({ ...base, topUniversity: true }), "topUniversity")).toBe(10);
    expect(points(computeHsp({ ...base, training: true }), "training")).toBe(5);
    expect(points(computeHsp({ ...base, hswOrg: true }), "hswOrg")).toBe(10);
  });

  it("awards the SME +10 (Note 3) only when the innovation-support employer is set", () => {
    // Bonus 4 alone is +10; with the SME add-on, +20. The add-on is dead weight
    // without its parent, matching the dependent checkbox in the UI.
    expect(points(computeHsp({ ...base, innovationOrg: true }), "innovationSme")).toBeUndefined();
    expect(points(computeHsp({ ...base, innovationOrg: true, innovationSme: true }), "innovationSme")).toBe(10);
    expect(points(computeHsp({ ...base, innovationOrg: false, innovationSme: true }), "innovationSme")).toBeUndefined();
    const withSme = computeHsp({ ...base, innovationOrg: true, innovationSme: true });
    const without = computeHsp({ ...base, innovationOrg: true });
    expect(withSme.total - without.total).toBe(10);
  });

  it("scores no age points for zero, negative, or empty age", () => {
    // A mistyped 0 or -5 must not land in the 'up to 29' band (15 points).
    expect(points(computeHsp({ ...base, age: 0 }), "age")).toBeUndefined();
    expect(points(computeHsp({ ...base, age: -5 }), "age")).toBeUndefined();
    expect(points(computeHsp({ ...base, age: NaN }), "age")).toBeUndefined();
    expect(points(computeHsp({ ...base, age: 29 }), "age")).toBe(15);
  });

  it("lets the income floor override a qualifying total", () => {
    // A strong profile (well past 70) still fails outright below ¥3M: the floor
    // is not a points question.
    const r = computeHsp({
      ...base, degree: "doctorate", japanese: "n1", researchAchievements: true,
      experienceYears: 10, age: 28, annualIncomeYen: 2_000_000,
    });
    expect(r.total).toBeGreaterThanOrEqual(70);
    expect(r.incomeDisqualified).toBe(true);
    expect(r.qualifies).toBe(false);
    expect(r.prYears).toBeNull();
  });

  it("flags J-Skip independently of the point total (a sub-70 case)", () => {
    // 10 years + ¥20M opens J-Skip, but degree none / age 45 keeps the total
    // under 70, so this pins independence rather than co-qualifying on points.
    const r = computeHsp({
      ...base, degree: "none", experienceYears: 10, age: 45,
      annualIncomeYen: 20_000_000, japanese: "none",
    });
    expect(r.jSkip).toBe(true);
    expect(r.total).toBeLessThan(HSP_THRESHOLD);
    expect(r.qualifies).toBe(false);
  });

  it("locks the PR and floor boundaries", () => {
    // Exactly 80 is the 1-year track; exactly ¥3M is not disqualified (floor is <).
    // doctorate 30 + income ¥10M 40 + age 30 (<=34) 10 = 80, experience 0.
    const at80 = computeHsp({
      ...base, degree: "doctorate", experienceYears: 0, annualIncomeYen: 10_000_000, age: 30,
    });
    expect(at80.total).toBe(80);
    expect(at80.prYears).toBe(1);
    expect(computeHsp({ ...base, annualIncomeYen: 3_000_000 }).incomeDisqualified).toBe(false);
    expect(computeHsp({ ...base, annualIncomeYen: 2_999_999 }).incomeDisqualified).toBe(true);
  });

  it("scores national qualifications at 5 each, capped at 10", () => {
    expect(points(computeHsp({ ...base, nationalQualifications: 0 }), "nationalQualification")).toBeUndefined();
    expect(points(computeHsp({ ...base, nationalQualifications: 1 }), "nationalQualification")).toBe(5);
    expect(points(computeHsp({ ...base, nationalQualifications: 2 }), "nationalQualification")).toBe(10);
    // Two is already the cap; a third qualification adds nothing.
    expect(points(computeHsp({ ...base, nationalQualifications: 3 }), "nationalQualification")).toBe(10);
  });

  it("excludes N2 language points when a Japanese-university degree is claimed", () => {
    // Bonus 9 (N2) is not awarded on top of Bonus 7 (Japanese degree), per the
    // table note; N1 is unaffected.
    expect(points(computeHsp({ ...base, japanese: "n2", japaneseDegree: true }), "japanese")).toBeUndefined();
    expect(points(computeHsp({ ...base, japanese: "n2", japaneseDegree: false }), "japanese")).toBe(10);
    expect(points(computeHsp({ ...base, japanese: "n1", japaneseDegree: true }), "japanese")).toBe(15);
  });

  it("scores an empty form (NaN fields) as zero, with no false disqualification", () => {
    // Every number field starts empty; the calculator passes NaN, which must read
    // as zero points and must not trip the income floor or J-Skip.
    const empty = computeHsp({
      ...base, degree: "none", experienceYears: NaN, annualIncomeYen: NaN,
      age: NaN, nationalQualifications: NaN,
    });
    expect(empty.total).toBe(0);
    expect(empty.breakdown).toHaveLength(0);
    expect(empty.incomeDisqualified).toBe(false);
    expect(empty.jSkip).toBe(false);
    expect(empty.qualifies).toBe(false);
  });
});
