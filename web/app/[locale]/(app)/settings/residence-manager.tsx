"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { updateResidence } from "@/app/lib/actions";
import { Field } from "@/app/components/field";
import type { Profile, ResidenceStatus } from "@/app/lib/types";
import { RESIDENCE_STATUSES } from "@/app/lib/types";

// The visa item's global half (SPEC.md § Data model): the user's own 在留資格 and
// its expiry, with the days-remaining read and the CoE lead-time guidance a job
// change implies. permanent_resident is the one status with no clock and no CoE.
export function ResidenceManager({ profile }: { profile: Profile }) {
  const t = useTranslations("residence");
  const trs = useTranslations("residenceStatus");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<ResidenceStatus | "">(profile.residence_status ?? "");

  const days = profile.residence_days_remaining;
  const warnAt = profile.reference.renewal_warning_days;

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateResidence(formData);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <div className="mt-4">
      {/* The days-remaining read, and the tone tracks urgency: danger once
          lapsed, saffron inside the warning window, plain otherwise. */}
      {profile.residence_status ? (
        <p className="text-sm">
          <span className="text-ink-soft">{t("remainingLabel")}: </span>
          {days === null ? (
            <span className="text-midnight">{t("noClock")}</span>
          ) : days < 0 ? (
            <span className="font-medium text-danger">{t("expiredAgo", { days: -days })}</span>
          ) : (
            <span
              className={days <= warnAt ? "font-medium text-saffron-ink" : "font-medium text-midnight"}
            >
              {t("daysRemaining", { days })}
            </span>
          )}
        </p>
      ) : null}

      {/* Job-change guidance: a work-visa holder changing employer needs a fresh
          CoE, and its lead time is the arithmetic to budget before a start date.
          A permanent resident needs none, so the line is suppressed there. */}
      {profile.residence_status && profile.residence_status !== "permanent_resident" ? (
        <p className="mt-2 text-xs text-ink-soft">
          {t("coeGuidance", { days: profile.reference.coe_lead_time_days })}
        </p>
      ) : null}

      <form action={onSubmit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="kk-label">{t("statusLabel")}</span>
          <select
            name="residence_status"
            value={status}
            onChange={(e) => setStatus(e.target.value as ResidenceStatus | "")}
            className="mt-1.5 block w-full border border-dune bg-linen px-3 py-2 text-sm text-midnight"
          >
            <option value="">{t("unset")}</option>
            {RESIDENCE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {trs(s)}
              </option>
            ))}
          </select>
        </label>
        {/* No expiry for a permanent resident, so the date field is hidden and
            (unmounted) sends nothing, matching the model's no-clock reading. */}
        {status && status !== "permanent_resident" ? (
          <Field
            name="residence_expires_on"
            label={t("expiresLabel")}
            type="date"
            defaultValue={profile.residence_expires_on ?? ""}
          />
        ) : null}
        <div className="sm:col-span-2">
          {error ? <p className="mb-2 text-sm text-danger">{error}</p> : null}
          <button
            type="submit"
            disabled={pending}
            className="bg-cobalt px-4 py-2 text-sm font-medium text-linen transition hover:bg-cobalt-2 disabled:opacity-50"
          >
            {pending ? t("saving") : t("save")}
          </button>
        </div>
      </form>
    </div>
  );
}
