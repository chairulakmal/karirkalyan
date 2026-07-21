"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { updateApplication } from "@/app/lib/actions";
import { formatDate, isOverdue } from "@/app/lib/format";
import { Field } from "@/app/components/field";
import type {
  Channel,
  CompanyTimezone,
  HiringEntity,
  JapaneseLevel,
  Sponsorship,
  StatusOfResidence,
  Status,
} from "@/app/lib/types";
import {
  CHANNELS,
  COMPANY_TIMEZONES,
  HIRING_ENTITIES,
  JAPANESE_LEVELS,
  SPONSORSHIPS,
  STATUSES_OF_RESIDENCE,
  TIMEZONE_LABEL_KEY,
} from "@/app/lib/types";
import type { TimezoneOverlap } from "@/app/lib/timezone";
import { formatJstDateTime, interviewIsAntisocial, toJstInputValue } from "@/app/lib/timezone";

type Props = {
  id: number;
  lockVersion: number;
  status: Status;
  activeStates: Status[];
  company: string;
  role: string;
  url: string | null;
  notes: string | null;
  followUpAt: string | null;
  appliedAt: string | null;
  createdAt: string;
  channel: Channel | null;
  agencyName: string | null;
  japaneseLevel: JapaneseLevel | null;
  sponsorship: Sponsorship | null;
  statusOfResidence: StatusOfResidence | null;
  hiringEntity: HiringEntity | null;
  companyTimezone: CompanyTimezone | null;
  overlapHoursRequired: number | null;
  // Computed server-side (page.tsx) so DST is current and there is no client
  // time-dependent render to mismatch on hydration. Null when no zone is set.
  timezoneOverlap: TimezoneOverlap | null;
  interviewAt: string | null;
  compAnnualMinYen: number | null;
  compAnnualMaxYen: number | null;
  compMonthsGuaranteed: number | null;
  compMonthsVariable: number | null;
};

// Yen from the API, 万円 on screen and in the inputs (the unit postings use).
function yenToMan(yen: number | null): string {
  return yen === null ? "" : String(yen / 10_000);
}

// A JST hour (0-23, fractional for half-hour zones like India) as HH:MM.
function fmtJst(hour: number): string {
  let h = Math.floor(hour);
  let m = Math.round((hour - h) * 60);
  if (m === 60) {
    h = (h + 1) % 24;
    m = 0;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function DetailsEditor(props: Props) {
  const t = useTranslations("details");
  const tc = useTranslations("channel");
  const tj = useTranslations("japaneseLevel");
  const ts = useTranslations("sponsorship");
  const tsor = useTranslations("statusOfResidence");
  const thire = useTranslations("hiringEntity");
  const ttz = useTranslations("companyTimezone");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Controlled (unlike the other edit fields) because the agency input only
  // renders on the agent channel, and that choice can change mid-edit.
  const [channel, setChannel] = useState<Channel | "">(props.channel ?? "");
  // Same reason: the 在留資格 select only renders while sponsorship is
  // "available", and that can change mid-edit. Falls back to "unknown" (the
  // server default) if the column is somehow null.
  const [sponsorship, setSponsorship] = useState<Sponsorship>(props.sponsorship ?? "unknown");

  const compRange =
    props.compAnnualMinYen === null
      ? null
      : props.compAnnualMaxYen === null
        ? t("compSingle", { min: (props.compAnnualMinYen / 10_000).toLocaleString(locale) })
        : t("compRange", {
            min: (props.compAnnualMinYen / 10_000).toLocaleString(locale),
            max: (props.compAnnualMaxYen / 10_000).toLocaleString(locale),
          });

  function onSubmit(formData: FormData) {
    setError(null);
    // Optimistic-locking guard: the API returns 409 if this is stale.
    formData.set("lock_version", String(props.lockVersion));
    startTransition(async () => {
      const result = await updateApplication(props.id, formData);
      if (result.ok) {
        setEditing(false);
        router.refresh(); // pull fresh values + bumped lock_version
      } else if (result.status === 409) {
        // Stale optimistic lock: refresh so fresh props (new lock_version)
        // flow in and the next save can succeed without a manual reload.
        setError(tErrors("refreshingStale"));
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  if (!editing) {
    return (
      <div className="border border-dune bg-linen p-5">
        <div className="flex items-baseline justify-between">
          <p className="kk-label">{t("title")}</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setEditing(true);
            }}
            className="text-xs font-medium text-cobalt underline underline-offset-4 hover:text-cobalt-2"
          >
            {t("edit")}
          </button>
        </div>
        <dl className="mt-3 space-y-2 text-sm">
          <Row
            label={t("applied")}
            value={props.appliedAt ? formatDate(props.appliedAt, locale) : t("blank")}
          />
          <Row
            label={t("followUp")}
            value={
              props.followUpAt ? (
                props.activeStates.includes(props.status) && isOverdue(props.followUpAt) ? (
                  <span className="font-medium text-danger">
                    {t("overdue", { date: formatDate(props.followUpAt, locale) })}
                  </span>
                ) : (
                  <span className="font-medium text-saffron">
                    {formatDate(props.followUpAt, locale)}
                  </span>
                )
              ) : (
                t("blank")
              )
            }
          />
          <Row label={t("created")} value={formatDate(props.createdAt, locale)} />
          <Row label={t("channel")} value={props.channel ? tc(props.channel) : t("blank")} />
          {/* Only meaningful on the agent channel, so only shown there: a
              "(none)" agency row on a direct application is noise. */}
          {props.channel === "agent" ? (
            <Row label={t("agency")} value={props.agencyName ?? t("blank")} />
          ) : null}
          <Row
            label={t("japaneseLevel")}
            value={props.japaneseLevel ? tj(props.japaneseLevel) : t("blank")}
          />
          <Row
            label={t("sponsorship")}
            value={ts(props.sponsorship ?? "unknown")}
          />
          {/* The 在留資格 is only meaningful when a role sponsors, so it shows
              only there: a status row on a role that will not sponsor is noise,
              the same reasoning as the agency row under a non-agent channel. */}
          {props.sponsorship === "available" ? (
            <Row
              label={t("statusOfResidence")}
              value={props.statusOfResidence ? tsor(props.statusOfResidence) : t("blank")}
            />
          ) : null}
          <Row
            label={t("hiringEntity")}
            value={props.hiringEntity ? thire(props.hiringEntity) : t("blank")}
          />
          <Row
            label={t("timezone")}
            value={props.companyTimezone ? ttz(TIMEZONE_LABEL_KEY[props.companyTimezone]) : t("blank")}
          />
          {/* Derived, not stored: the company's workday mapped into JST, plus a
              flag when the required overlap forces antisocial hours. Computed
              server-side, so DST is current. */}
          {props.timezoneOverlap ? (
            <Row
              label={t("jstOverlap")}
              value={
                <span
                  className={
                    props.timezoneOverlap.survivable
                      ? "text-midnight"
                      : "font-medium text-danger"
                  }
                >
                  {t("jstCore", {
                    start: fmtJst(props.timezoneOverlap.jstWorkdayStart),
                    end:
                      fmtJst(props.timezoneOverlap.jstWorkdayEnd) +
                      (props.timezoneOverlap.crossesMidnight ? ` ${t("nextDay")}` : ""),
                  })}
                  {props.overlapHoursRequired
                    ? ` · ${t("overlapNeed", { hours: props.overlapHoursRequired })}`
                    : ""}
                  {props.timezoneOverlap.survivable ? "" : ` · ${t("antisocial")}`}
                </span>
              }
            />
          ) : null}
          <Row
            label={t("interview")}
            value={
              props.interviewAt ? (
                <span
                  className={
                    interviewIsAntisocial(props.interviewAt)
                      ? "font-medium text-danger"
                      : "text-midnight"
                  }
                >
                  {t("interviewJst", { when: formatJstDateTime(props.interviewAt) })}
                  {interviewIsAntisocial(props.interviewAt) ? ` · ${t("antisocial")}` : ""}
                </span>
              ) : (
                t("blank")
              )
            }
          />
          <Row label={t("comp")} value={compRange ?? t("blank")} />
          <Row
            label={t("compMonthsGuaranteed")}
            value={props.compMonthsGuaranteed ?? t("blank")}
          />
          <Row
            label={t("compMonthsVariable")}
            value={props.compMonthsVariable ?? t("blank")}
          />
        </dl>
        {/* A plain <a> to the API route (not the i18n Link): it is a download
            proxy, not a localized page, and Rails sets the attachment filename.
            Same reasoning as the export links (SPEC.md § Exports). */}
        {props.interviewAt ? (
          <a
            href={`/api/applications/${props.id}/interview`}
            className="mt-3 inline-block text-xs font-medium text-cobalt underline underline-offset-4 hover:text-cobalt-2"
          >
            {t("addToCalendar")}
          </a>
        ) : null}
        {props.notes ? (
          <>
            <p className="kk-label mt-5">{t("notes")}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-midnight">{props.notes}</p>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="border border-dune bg-linen p-5">
      <p className="kk-label">{t("editTitle")}</p>
      <form action={onSubmit} className="mt-3 space-y-4">
        <Field name="company" label={t("company")} defaultValue={props.company} required />
        <Field name="role" label={t("role")} defaultValue={props.role} required />
        <Field
          name="url"
          label={t("url")}
          type="url"
          defaultValue={props.url ?? ""}
          placeholder="https://…"
        />
        <Field
          name="follow_up_at"
          label={t("followUpDate")}
          type="date"
          defaultValue={props.followUpAt ? props.followUpAt.slice(0, 10) : ""}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="kk-label">{t("channel")}</span>
            <select
              name="channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value as Channel | "")}
              className="mt-1.5 block w-full border border-dune bg-linen px-3 py-2 text-sm text-midnight"
            >
              <option value="">{t("blank")}</option>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {tc(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="kk-label">{t("japaneseLevel")}</span>
            <select
              name="japanese_level"
              defaultValue={props.japaneseLevel ?? ""}
              className="mt-1.5 block w-full border border-dune bg-linen px-3 py-2 text-sm text-midnight"
            >
              <option value="">{t("blank")}</option>
              {JAPANESE_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {tj(l)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {channel === "agent" ? (
          <Field
            name="agency_name"
            label={t("agency")}
            defaultValue={props.agencyName ?? ""}
          />
        ) : null}
        {/* sponsorship has no blank option: "unknown" is the value, not the
            absence. The 在留資格 select rides the "available" branch, and an
            unmounted select sends nothing, so switching away clears it. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="kk-label">{t("sponsorship")}</span>
            <select
              name="sponsorship"
              value={sponsorship}
              onChange={(e) => setSponsorship(e.target.value as Sponsorship)}
              className="mt-1.5 block w-full border border-dune bg-linen px-3 py-2 text-sm text-midnight"
            >
              {SPONSORSHIPS.map((s) => (
                <option key={s} value={s}>
                  {ts(s)}
                </option>
              ))}
            </select>
          </label>
          {sponsorship === "available" ? (
            <label className="block text-sm">
              <span className="kk-label">{t("statusOfResidence")}</span>
              {/* Uncontrolled (defaultValue), unlike the new-application form
                  where this select is controlled state. The choice is deliberate:
                  sponsorship must be controlled because it gates this select's
                  visibility, but the 在留資格 itself gates nothing, so on this
                  edit surface a re-mount should restore the persisted value, not
                  a mid-edit choice. hiring_entity below is uncontrolled for the
                  same reason. */}
              <select
                name="status_of_residence"
                defaultValue={props.statusOfResidence ?? ""}
                className="mt-1.5 block w-full border border-dune bg-linen px-3 py-2 text-sm text-midnight"
              >
                <option value="">{t("blank")}</option>
                {STATUSES_OF_RESIDENCE.map((s) => (
                  <option key={s} value={s}>
                    {tsor(s)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <label className="block text-sm">
          <span className="kk-label">{t("hiringEntity")}</span>
          <select
            name="hiring_entity"
            defaultValue={props.hiringEntity ?? ""}
            className="mt-1.5 block w-full border border-dune bg-linen px-3 py-2 text-sm text-midnight"
          >
            <option value="">{t("blank")}</option>
            {HIRING_ENTITIES.map((h) => (
              <option key={h} value={h}>
                {thire(h)}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="kk-label">{t("timezone")}</span>
            <select
              name="company_timezone"
              defaultValue={props.companyTimezone ?? ""}
              className="mt-1.5 block w-full border border-dune bg-linen px-3 py-2 text-sm text-midnight"
            >
              <option value="">{t("blank")}</option>
              {COMPANY_TIMEZONES.map((z) => (
                <option key={z} value={z}>
                  {ttz(TIMEZONE_LABEL_KEY[z])}
                </option>
              ))}
            </select>
          </label>
          <Field
            name="overlap_hours_required"
            label={t("overlapHours")}
            type="number"
            min="0"
            max="24"
            step="0.5"
            defaultValue={props.overlapHoursRequired ?? ""}
          />
        </div>
        {/* datetime-local is a naive JST wall-clock; the server parses it in
            Time.zone (Tokyo) and stores UTC, and the value is rendered back in
            JST. Blank clears it. */}
        <Field
          name="interview_at"
          label={t("interview")}
          type="datetime-local"
          defaultValue={props.interviewAt ? toJstInputValue(props.interviewAt) : ""}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            name="comp_annual_min_man"
            label={t("compMinMan")}
            type="number"
            min="0"
            step="1"
            defaultValue={yenToMan(props.compAnnualMinYen)}
          />
          <Field
            name="comp_annual_max_man"
            label={t("compMaxMan")}
            type="number"
            min="0"
            step="1"
            defaultValue={yenToMan(props.compAnnualMaxYen)}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            name="comp_months_guaranteed"
            label={t("compMonthsGuaranteed")}
            type="number"
            min="0"
            step="0.5"
            defaultValue={props.compMonthsGuaranteed ?? ""}
          />
          <Field
            name="comp_months_variable"
            label={t("compMonthsVariable")}
            type="number"
            min="0"
            step="0.5"
            defaultValue={props.compMonthsVariable ?? ""}
          />
        </div>
        <label className="block text-sm">
          <span className="kk-label">{t("notes")}</span>
          <textarea
            name="notes"
            rows={4}
            defaultValue={props.notes ?? ""}
            className="mt-1.5 block w-full border border-dune bg-linen px-3 py-2 text-sm text-midnight placeholder:text-ink-soft"
          />
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="bg-cobalt px-4 py-2 text-sm font-medium text-linen transition hover:bg-cobalt-2 disabled:opacity-50"
          >
            {pending ? t("saving") : t("save")}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={pending}
            className="border border-dune bg-linen px-4 py-2 text-sm text-ink-soft transition hover:bg-sand disabled:opacity-50"
          >
            {t("cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-right text-midnight">{value}</dd>
    </div>
  );
}
