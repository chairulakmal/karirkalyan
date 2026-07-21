"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { computeHsp, HSP_THRESHOLD, type Degree, type JapaneseLevel } from "@/app/lib/hsp";

// The yes/no bonus points an engineer can claim. National qualifications (Bonus
// 3) is a count, not a toggle, so it is rendered on its own row first, ahead of
// these. The order here is not the MOJ table's: the items an engineer most often
// holds lead (the two Japanese-university bonuses), the rarer ones trail.
type BonusKey =
  | "multipleDegrees"
  | "researchAchievements"
  | "innovationOrg"
  | "smeRnd"
  | "foreignQualification"
  | "japaneseDegree"
  | "growthField"
  | "topUniversity"
  | "training"
  | "hswOrg";

const BONUS_ORDER: BonusKey[] = [
  "japaneseDegree",
  "topUniversity",
  "multipleDegrees",
  "researchAchievements",
  "innovationOrg",
  "smeRnd",
  "foreignQualification",
  "growthField",
  "training",
  "hswOrg",
];

// The interactive calculator. Pure logic lives in app/lib/hsp.ts (unit-tested);
// this is the form and the live result over it. Number fields start empty (a NaN
// the pure logic reads as zero), so an untouched form scores 0 out of 70.
export function HspCalculator() {
  const t = useTranslations("hsp");
  const [degree, setDegree] = useState<Degree>("none");
  const [experienceYears, setExperienceYears] = useState(NaN);
  const [incomeMan, setIncomeMan] = useState(NaN);
  const [age, setAge] = useState(NaN);
  const [japanese, setJapanese] = useState<JapaneseLevel>("none");
  // Bonus 3 is 5 points per qualification capped at 10: none (0), one (1 → +5),
  // or two or more (2 → +10). Two checkboxes, mutually exclusive through the
  // shared count.
  const [nationalQualifications, setNationalQualifications] = useState(0);
  const [bonuses, setBonuses] = useState<Record<BonusKey, boolean>>(
    () => Object.fromEntries(BONUS_ORDER.map((k) => [k, false])) as Record<BonusKey, boolean>,
  );

  const setBonus = (key: BonusKey, value: boolean) => setBonuses((b) => ({ ...b, [key]: value }));

  const result = computeHsp({
    degree,
    experienceYears,
    annualIncomeYen: incomeMan * 10_000,
    age,
    japanese,
    nationalQualifications,
    multipleDegrees: bonuses.multipleDegrees,
    researchAchievements: bonuses.researchAchievements,
    innovationOrg: bonuses.innovationOrg,
    smeRnd: bonuses.smeRnd,
    foreignQualification: bonuses.foreignQualification,
    japaneseDegree: bonuses.japaneseDegree,
    growthField: bonuses.growthField,
    topUniversity: bonuses.topUniversity,
    training: bonuses.training,
    hswOrg: bonuses.hswOrg,
  });

  const bonusItem = (key: BonusKey) => (
    <BonusItem
      key={key}
      label={t(key)}
      note={t(`notes.${key}`)}
      infoLabel={t("infoAria")}
      checked={bonuses[key]}
      onChange={(v) => setBonus(key, v)}
    />
  );

  return (
    <div className="mt-8 grid items-start gap-6 lg:grid-cols-5">
      <form
        className="space-y-8 border border-dune bg-linen p-6 lg:col-span-3 lg:p-8"
        onSubmit={(e) => e.preventDefault()}
      >
        <fieldset className="space-y-4">
          <legend className="kk-label">{t("profileTitle")}</legend>
          <Select
            label={t("degree")}
            value={degree}
            onChange={(v) => setDegree(v as Degree)}
            options={["doctorate", "master", "bachelor", "none"].map((v) => ({ value: v, label: t(`degrees.${v}`) }))}
          />
          <NumberField label={t("experience")} placeholder="3" min={0} max={60} onChange={setExperienceYears} />
          <NumberField label={t("income")} placeholder="600" min={0} max={100000} step={10} onChange={setIncomeMan} />
          <NumberField label={t("age")} placeholder="30" min={0} max={120} onChange={setAge} />
          <Select
            label={t("japanese")}
            value={japanese}
            onChange={(v) => setJapanese(v as JapaneseLevel)}
            options={["n1", "n2", "none"].map((v) => ({ value: v, label: t(`japaneseLevels.${v}`) }))}
          />
        </fieldset>
        <fieldset className="space-y-3 border-t border-dune pt-6">
          <legend className="kk-label">{t("bonusTitle")}</legend>
          <p className="text-xs leading-relaxed text-ink-soft">{t("bonusHint")}</p>
          <NationalQualifications value={nationalQualifications} onChange={setNationalQualifications} />
          {BONUS_ORDER.map(bonusItem)}
        </fieldset>
      </form>

      <div className="space-y-4 lg:col-span-2 lg:sticky lg:top-8 lg:self-start">
        <div
          className={`border p-6 ${
            result.qualifies ? "border-cobalt bg-cobalt/5" : "border-dune bg-sand/30"
          }`}
        >
          <p className="kk-label">{t("total")}</p>
          <p className="mt-1 font-mono text-5xl text-midnight">
            {result.total}
            <span className="ml-1 text-xl text-ink-soft">/ {HSP_THRESHOLD}</span>
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
          {result.breakdown.length > 0 ? (
            <dl className="mt-3 space-y-1.5 text-sm">
              {result.breakdown.map((row) => (
                <div key={row.key} className="flex justify-between gap-4">
                  <dt className="text-ink-soft">{t(`rows.${row.key}`)}</dt>
                  <dd className="font-mono text-midnight">+{row.points}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-3 text-sm text-ink-soft">{t("breakdownEmpty")}</p>
          )}
        </div>

        <div className="space-y-1 text-xs text-ink-soft">
          <p>{t("privacyNote")}</p>
          <p>{t("disclaimer")}</p>
        </div>
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
    <label className="block">
      <span className="kk-label">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 block w-full border border-dune bg-linen px-3 py-2.5 text-base text-midnight transition hover:border-ink-soft"
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

// A plain numeric field that behaves the way a person types: it keeps its own
// text draft, reports NaN while empty (the pure logic reads that as zero), and
// only clamps to [min, max] on blur. Clamping on every keystroke is what made
// typing "32" into an age land on 80: an intermediate "3" clamped up to the
// minimum, and the next digit appended to that.
function NumberField({
  label,
  placeholder,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  placeholder?: string;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState("");

  function handleChange(raw: string) {
    setDraft(raw);
    if (raw === "") {
      onChange(NaN);
      return;
    }
    const n = Number(raw);
    if (Number.isFinite(n)) onChange(n); // live and unclamped; blur normalises
  }

  function handleBlur() {
    if (draft === "") {
      onChange(NaN);
      return;
    }
    const n = Number(draft);
    if (!Number.isFinite(n)) {
      setDraft("");
      onChange(NaN);
      return;
    }
    const clamped = Math.max(min, Math.min(max, n));
    setDraft(String(clamped));
    onChange(clamped);
  }

  return (
    <label className="block">
      <span className="kk-label">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={draft}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        className="mt-2 block w-full border border-dune bg-linen px-3 py-2.5 text-base text-midnight transition hover:border-ink-soft placeholder:text-dune"
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
    <label className="flex cursor-pointer items-start gap-2 text-sm text-midnight">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-cobalt"
      />
      {label}
    </label>
  );
}

// A small "i" toggle that reveals the verbatim MOJ wording for a bonus point.
// An SVG glyph, not a bordered circle, so it respects the design system's radius-0
// rule. Controlled: the owning row keeps the open state and renders the note.
function InfoButton({
  open,
  onClick,
  label,
  controls,
}: {
  open: boolean;
  onClick: () => void;
  label: string;
  controls?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls={controls}
      aria-label={label}
      className={`mt-0.5 shrink-0 transition ${open ? "text-cobalt" : "text-ink-soft hover:text-cobalt"}`}
    >
      <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <circle cx="8" cy="8" r="6.25" />
        <path d="M8 7.25v3.5" strokeLinecap="round" />
        <circle cx="8" cy="4.75" r="0.7" fill="currentColor" stroke="none" />
      </svg>
    </button>
  );
}

function NotePanel({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} className="mt-1.5 ml-6 border-l-2 border-cobalt/40 pl-3 text-xs leading-relaxed text-ink-soft">
      {children}
    </p>
  );
}

// One bonus point: its checkbox, an info button carrying the verbatim MOJ note,
// and the note itself revealed below on demand.
function BonusItem({
  label,
  note,
  infoLabel,
  checked,
  onChange,
}: {
  label: string;
  note: string;
  infoLabel: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const uid = useId();
  const noteId = `${uid}-note`;
  return (
    <div>
      <div className="flex items-start gap-2 text-sm text-midnight">
        <input
          id={`${uid}-cb`}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-cobalt"
        />
        <label htmlFor={`${uid}-cb`} className="cursor-pointer">
          {label}
        </label>
        <InfoButton open={open} onClick={() => setOpen((o) => !o)} label={infoLabel} controls={noteId} />
      </div>
      {open ? <NotePanel id={noteId}>{note}</NotePanel> : null}
    </div>
  );
}

// Bonus 3, its own row: an explainer, the verbatim MOJ note behind an info button,
// and the two inline "1" / "2+" checkboxes that drive the 5-each, max-10 count.
function NationalQualifications({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const t = useTranslations("hsp");
  const [open, setOpen] = useState(false);
  const noteId = `${useId()}-note`;
  return (
    <div>
      <div className="flex items-start gap-2">
        <p className="text-sm text-midnight">{t("nationalQualExplainer")}</p>
        <InfoButton open={open} onClick={() => setOpen((o) => !o)} label={t("infoAria")} controls={noteId} />
      </div>
      <div className="mt-2 flex gap-8 pl-6">
        <Check label={t("nationalQual1")} checked={value === 1} onChange={(v) => onChange(v ? 1 : 0)} />
        <Check label={t("nationalQual2")} checked={value === 2} onChange={(v) => onChange(v ? 2 : 0)} />
      </div>
      {open ? <NotePanel id={noteId}>{t("notes.nationalQual")}</NotePanel> : null}
    </div>
  );
}
