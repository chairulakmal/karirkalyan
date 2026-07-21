"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { computeHsp, HSP_THRESHOLD, type Degree, type JapaneseLevel } from "@/app/lib/hsp";

// The interactive calculator. Pure logic lives in app/lib/hsp.ts (unit-tested);
// this is the form and the live result over it.
export function HspCalculator() {
  const t = useTranslations("hsp");
  const [degree, setDegree] = useState<Degree>("bachelor");
  const [experienceYears, setExperienceYears] = useState(3);
  const [incomeMan, setIncomeMan] = useState(600);
  const [age, setAge] = useState(30);
  const [japanese, setJapanese] = useState<JapaneseLevel>("none");
  const [japaneseDegree, setJapaneseDegree] = useState(false);
  const [researchAchievements, setResearchAchievements] = useState(false);
  const [nationalQualification, setNationalQualification] = useState(false);

  const result = computeHsp({
    degree,
    experienceYears,
    annualIncomeYen: incomeMan * 10_000,
    age,
    japanese,
    japaneseDegree,
    researchAchievements,
    nationalQualification,
  });

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <form className="space-y-4 border border-dune bg-linen p-6" onSubmit={(e) => e.preventDefault()}>
        <Select
          label={t("degree")}
          value={degree}
          onChange={(v) => setDegree(v as Degree)}
          options={["doctorate", "master", "bachelor", "none"].map((v) => ({ value: v, label: t(`degrees.${v}`) }))}
        />
        <Number label={t("experience")} value={experienceYears} min={0} max={50} onChange={setExperienceYears} />
        <Number label={t("income")} value={incomeMan} min={0} max={5000} step={10} onChange={setIncomeMan} />
        <Number label={t("age")} value={age} min={18} max={80} onChange={setAge} />
        <Select
          label={t("japanese")}
          value={japanese}
          onChange={(v) => setJapanese(v as JapaneseLevel)}
          options={["n1", "n2", "none"].map((v) => ({ value: v, label: t(`japaneseLevels.${v}`) }))}
        />
        <div className="space-y-2 border-t border-dune pt-4">
          <p className="kk-label">{t("bonusTitle")}</p>
          <Check label={t("japaneseDegree")} checked={japaneseDegree} onChange={setJapaneseDegree} />
          <Check label={t("research")} checked={researchAchievements} onChange={setResearchAchievements} />
          <Check label={t("nationalQualification")} checked={nationalQualification} onChange={setNationalQualification} />
        </div>
      </form>

      <div className="space-y-4">
        <div
          className={`border p-6 ${
            result.qualifies ? "border-cobalt bg-cobalt/5" : "border-dune bg-sand/30"
          }`}
        >
          <p className="kk-label">{t("total")}</p>
          <p className="mt-1 font-mono text-4xl text-midnight">
            {result.total}
            <span className="ml-1 text-lg text-ink-soft">/ {HSP_THRESHOLD}</span>
          </p>
          {result.incomeDisqualified ? (
            <p className="mt-3 text-sm font-medium text-danger">{t("incomeFloor")}</p>
          ) : result.qualifies ? (
            <p className="mt-3 text-sm font-medium text-cobalt">
              {t("qualifies")}{" "}
              {result.prYears ? t("prTrack", { years: result.prYears }) : null}
            </p>
          ) : result.jSkip ? null : (
            // Suppressed when J-Skip qualifies: the J-Skip line below is then the
            // positive verdict, so "you need N more points" beside it would
            // contradict it (J-Skip is a separate path, independent of the total).
            <p className="mt-3 text-sm text-ink-soft">{t("belowThreshold", { short: HSP_THRESHOLD - result.total })}</p>
          )}
          {result.jSkip ? (
            <p className="mt-3 border-t border-cobalt/30 pt-3 text-sm font-medium text-midnight">{t("jSkip")}</p>
          ) : null}
        </div>

        <div className="border border-dune bg-linen p-6">
          <p className="kk-label">{t("breakdown")}</p>
          <dl className="mt-3 space-y-1.5 text-sm">
            {result.breakdown.map((row) => (
              <div key={row.key} className="flex justify-between gap-4">
                <dt className="text-ink-soft">{t(`rows.${row.key}`)}</dt>
                <dd className="font-mono text-midnight">+{row.points}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="text-xs text-ink-soft">{t("disclaimer")}</p>
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block text-sm">
      <span className="kk-label">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 block w-full border border-dune bg-linen px-3 py-2 text-sm text-midnight"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Number({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="kk-label">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Math.max(min, Math.min(max, globalThis.Number(e.target.value) || 0)))}
        className="mt-1.5 block w-full border border-dune bg-linen px-3 py-2 text-sm text-midnight"
      />
    </label>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-midnight">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-cobalt"
      />
      {label}
    </label>
  );
}
