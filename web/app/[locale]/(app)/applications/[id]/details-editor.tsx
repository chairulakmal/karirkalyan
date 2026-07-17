"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { updateApplication } from "@/app/lib/actions";
import { formatDate, isOverdue } from "@/app/lib/format";
import { Field } from "@/app/components/field";
import type { Status } from "@/app/lib/types";

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
};

export function DetailsEditor(props: Props) {
  const t = useTranslations("details");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
        </dl>
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
