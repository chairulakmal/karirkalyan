"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateApplication } from "@/app/lib/actions";
import { ACTIVE_STATUSES, formatDate, isOverdue } from "@/app/lib/format";
import { Field } from "@/app/components/field";
import type { Status } from "@/app/lib/types";

type Props = {
  id: number;
  lockVersion: number;
  status: Status;
  company: string;
  role: string;
  url: string | null;
  notes: string | null;
  followUpAt: string | null;
  appliedAt: string | null;
  createdAt: string;
};

export function DetailsEditor(props: Props) {
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
        setError("This application was changed elsewhere — refreshing to the latest version…");
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
          <p className="kk-label">Details</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setEditing(true);
            }}
            className="text-xs font-medium text-cobalt underline underline-offset-4 hover:text-cobalt-2"
          >
            Edit
          </button>
        </div>
        <dl className="mt-3 space-y-2 text-sm">
          <Row label="Applied" value={props.appliedAt ? formatDate(props.appliedAt) : "—"} />
          <Row
            label="Follow up"
            value={
              props.followUpAt ? (
                ACTIVE_STATUSES.has(props.status) && isOverdue(props.followUpAt) ? (
                  <span className="font-medium text-red-700">
                    {formatDate(props.followUpAt)} · overdue
                  </span>
                ) : (
                  <span className="font-medium text-saffron">{formatDate(props.followUpAt)}</span>
                )
              ) : (
                "—"
              )
            }
          />
          <Row label="Created" value={formatDate(props.createdAt)} />
        </dl>
        {props.notes ? (
          <>
            <p className="kk-label mt-5">Notes</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-midnight">{props.notes}</p>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="border border-dune bg-linen p-5">
      <p className="kk-label">Edit application</p>
      <form action={onSubmit} className="mt-3 space-y-4">
        <Field name="company" label="Company" defaultValue={props.company} required />
        <Field name="role" label="Role" defaultValue={props.role} required />
        <Field
          name="url"
          label="Job posting URL"
          type="url"
          defaultValue={props.url ?? ""}
          placeholder="https://…"
        />
        <Field
          name="follow_up_at"
          label="Follow-up date"
          type="date"
          defaultValue={props.followUpAt ? props.followUpAt.slice(0, 10) : ""}
        />
        <label className="block text-sm">
          <span className="kk-label">Notes</span>
          <textarea
            name="notes"
            rows={4}
            defaultValue={props.notes ?? ""}
            className="mt-1.5 block w-full border border-dune bg-linen px-3 py-2 text-sm text-midnight placeholder:text-ink-soft focus:border-cobalt focus:outline-none focus:ring-1 focus:ring-cobalt"
          />
        </label>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="bg-cobalt px-4 py-2 text-sm font-medium text-linen transition hover:bg-cobalt-2 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={pending}
            className="border border-dune bg-linen px-4 py-2 text-sm text-ink-soft transition hover:bg-sand disabled:opacity-50"
          >
            Cancel
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
