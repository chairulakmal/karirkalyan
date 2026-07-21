// Highly Skilled Professional (高度専門職) points, the 高度専門・技術分野 (technical)
// track, the one a software engineer applies under. Pure functions so the
// public calculator page stays a thin shell over tested logic.
//
// Point values are from the MOJ ポイント計算表 (令和3年7月30日以降, still the current
// table), the 70-point threshold and the PR fast-track years from the MOJ 高度
// 専門職 status page, and the J-Skip gate from the ISA 特別高度人材制度 page.
// Verified against those primary sources 2026-07-21; re-confirm on the annual
// visa-research pass (SPEC.md § HSP calculator, TODO.md perishable-facts rule).
//
// This models the engineer's column only. Of the table's bonus points, the three
// that live purely in the 経営・管理 (management) column are out of scope: position
// held (Bonus 2), a ¥100M business investment (Bonus 13), and investment-
// management work (Bonus 14). Every other bonus an engineer can claim is here.
export const HSP_THRESHOLD = 70;
// J-Skip (特別高度人材制度) grants HSP-1 directly, bypassing the points, at this
// income with a degree-or-experience gate.
export const JSKIP_INCOME_YEN = 20_000_000;
// Below this annual income an applicant is disqualified regardless of points.
export const INCOME_FLOOR_YEN = 3_000_000;
// Bonus 3: a Japan national qualification is worth 5 points each, capped at 10
// (i.e. two or more qualifications).
export const NATIONAL_QUAL_POINTS_EACH = 5;
export const NATIONAL_QUAL_POINTS_MAX = 10;

export type Degree = "doctorate" | "master" | "bachelor" | "none";
export type JapaneseLevel = "n1" | "n2" | "none";

export type HspInputs = {
  degree: Degree;
  experienceYears: number;
  annualIncomeYen: number;
  age: number;
  japanese: JapaneseLevel;
  // Bonus points, every one an engineer (technical track) can claim.
  multipleDegrees: boolean; // degrees in multiple fields (+5)
  researchAchievements: boolean; // Bonus 1: patents / papers / grants (+15)
  nationalQualifications: number; // Bonus 3: 5 each, capped at 10
  innovationOrg: boolean; // Bonus 4: employer under innovation-support measures (+10)
  smeRnd: boolean; // Bonus 5: SME spending >3% of revenue on R&D (+5)
  foreignQualification: boolean; // Bonus 6: a foreign qualification for the work (+5)
  japaneseDegree: boolean; // Bonus 7: a degree from a Japanese university (+10)
  growthField: boolean; // Bonus 10: advanced project in a designated growth field (+10)
  topUniversity: boolean; // Bonus 11: graduate of a university designated by Japan (+10)
  training: boolean; // Bonus 12: completed a training course designated by Japan (+5)
  hswOrg: boolean; // Bonus 15: employer supports accepting highly skilled workers (+10)
};

export type HspBreakdownRow = { key: string; points: number };

export type HspResult = {
  total: number;
  qualifies: boolean;
  // Years of residence for PR fast-track: 1 at 80+, 3 at 70-79, null below.
  prYears: 1 | 3 | null;
  // J-Skip qualifies directly, independent of the point total.
  jSkip: boolean;
  // Income under the floor disqualifies regardless of points.
  incomeDisqualified: boolean;
  breakdown: HspBreakdownRow[];
};

function degreePoints(degree: Degree): number {
  // 学歴, read straight off the MOJ ポイント計算表: 博士号 30, 修士号 20, 大学卒業 10.
  // The 博士号 30 cell spans both the 高度学術研究分野 and 高度専門・技術分野 columns,
  // so a doctorate is 30 on the technical track this calculator models, not 20.
  // Verified against the source PDF 2026-07-21.
  if (degree === "doctorate") return 30;
  if (degree === "master") return 20;
  if (degree === "bachelor") return 10;
  return 0;
}

function experiencePoints(years: number): number {
  if (years >= 10) return 20;
  if (years >= 7) return 15;
  if (years >= 5) return 10;
  if (years >= 3) return 5;
  return 0;
}

function agePoints(age: number): number {
  if (age <= 29) return 15;
  if (age <= 34) return 10;
  if (age <= 39) return 5;
  return 0;
}

// Bonus 8 (N1, +15) and Bonus 9 (N2, +10). N2's points are excluded when a
// Japanese-university degree (Bonus 7) is already claimed, per the table note.
function japanesePoints(level: JapaneseLevel, japaneseDegree: boolean): number {
  if (level === "n1") return 15;
  if (level === "n2") return japaneseDegree ? 0 : 10;
  return 0;
}

// Bonus 3: 5 points per Japan national qualification for the work, capped at 10.
// An empty field arrives as NaN (nothing entered): score it as zero.
function nationalQualificationPoints(count: number): number {
  if (!Number.isFinite(count)) return 0;
  const n = Math.max(0, Math.floor(count));
  return Math.min(n * NATIONAL_QUAL_POINTS_EACH, NATIONAL_QUAL_POINTS_MAX);
}

// The income table is age-adjusted: the higher bands score for everyone, the
// lower ones only below an age ceiling. Read straight off the MOJ ②年収配点表.
function incomePoints(incomeYen: number, age: number): number {
  const m = incomeYen / 1_000_000;
  if (m >= 10) return 40;
  if (m >= 9) return 35;
  if (m >= 8) return 30;
  if (m >= 7) return age <= 39 ? 25 : 0;
  if (m >= 6) return age <= 39 ? 20 : 0;
  if (m >= 5) return age <= 34 ? 15 : 0;
  if (m >= 4) return age <= 29 ? 10 : 0;
  return 0;
}

export function computeHsp(inputs: HspInputs): HspResult {
  const breakdown: HspBreakdownRow[] = [
    { key: "degree", points: degreePoints(inputs.degree) },
    { key: "experience", points: experiencePoints(inputs.experienceYears) },
    { key: "income", points: incomePoints(inputs.annualIncomeYen, inputs.age) },
    { key: "age", points: agePoints(inputs.age) },
    { key: "japanese", points: japanesePoints(inputs.japanese, inputs.japaneseDegree) },
    { key: "research", points: inputs.researchAchievements ? 15 : 0 },
    { key: "nationalQualification", points: nationalQualificationPoints(inputs.nationalQualifications) },
    { key: "multipleDegrees", points: inputs.multipleDegrees ? 5 : 0 },
    { key: "innovationOrg", points: inputs.innovationOrg ? 10 : 0 },
    { key: "smeRnd", points: inputs.smeRnd ? 5 : 0 },
    { key: "foreignQualification", points: inputs.foreignQualification ? 5 : 0 },
    { key: "japaneseDegree", points: inputs.japaneseDegree ? 10 : 0 },
    { key: "growthField", points: inputs.growthField ? 10 : 0 },
    { key: "topUniversity", points: inputs.topUniversity ? 10 : 0 },
    { key: "training", points: inputs.training ? 5 : 0 },
    { key: "hswOrg", points: inputs.hswOrg ? 10 : 0 },
  ].filter((row) => row.points > 0);

  const total = breakdown.reduce((sum, row) => sum + row.points, 0);
  const incomeDisqualified = inputs.annualIncomeYen < INCOME_FLOOR_YEN;

  const jSkip =
    (inputs.degree === "master" || inputs.degree === "doctorate" || inputs.experienceYears >= 10) &&
    inputs.annualIncomeYen >= JSKIP_INCOME_YEN;

  const prYears = total >= 80 ? 1 : total >= HSP_THRESHOLD ? 3 : null;

  return {
    total,
    qualifies: !incomeDisqualified && total >= HSP_THRESHOLD,
    prYears: incomeDisqualified ? null : prYears,
    jSkip,
    incomeDisqualified,
    breakdown,
  };
}
