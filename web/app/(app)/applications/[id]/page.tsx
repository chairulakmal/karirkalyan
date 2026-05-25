import Link from "next/link";
import { notFound } from "next/navigation";
import { apiFetch } from "@/app/lib/api";
import { formatDate, statusBadgeClass, statusLabel, timeAgo } from "@/app/lib/format";
import type { ApplicationWithDetail } from "@/app/lib/types";
import { TransitionButtons } from "./transition-buttons";
import { FileUpload } from "./file-upload";
import { DeleteButton } from "./delete-button";

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await apiFetch<ApplicationWithDetail>(`/applications/${id}`);

  if (!res.ok) {
    if (res.status === 404) notFound();
    return (
      <div className="rounded-lg border border-rose-300 bg-rose-50 p-5 text-sm text-rose-800">
        Failed to load: {res.error}
      </div>
    );
  }
  const app = res.data;
  const numId = Number(id);

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{app.company}</h1>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${statusBadgeClass(app.status)}`}
            >
              {statusLabel(app.status)}
            </span>
          </div>
          <p className="mt-1 text-zinc-600">{app.role}</p>
          {app.url ? (
            <a
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-sm text-zinc-500 underline underline-offset-4 hover:text-zinc-900"
            >
              {app.url}
            </a>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/dashboard"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            ← Dashboard
          </Link>
          <DeleteButton id={numId} />
        </div>
      </header>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-medium text-zinc-700">Transition</h2>
        {app.valid_next_states.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            <code>{app.status}</code> is terminal — no further transitions allowed.
          </p>
        ) : (
          <TransitionButtons
            id={numId}
            lockVersion={app.lock_version}
            validNextStates={app.valid_next_states}
          />
        )}
      </section>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-medium text-zinc-700">Details</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Applied" value={app.applied_at ? formatDate(app.applied_at) : "—"} />
            <Row
              label="Follow up"
              value={
                app.follow_up_at ? (
                  <span className="font-medium text-amber-700">{formatDate(app.follow_up_at)}</span>
                ) : (
                  "—"
                )
              }
            />
            <Row label="Created" value={formatDate(app.created_at)} />
          </dl>
          {app.notes ? (
            <>
              <h3 className="mt-5 text-sm font-medium text-zinc-700">Notes</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{app.notes}</p>
            </>
          ) : null}
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-medium text-zinc-700">Documents</h2>
          <FileUpload
            id={numId}
            field="resume"
            label="Resume"
            uploadedAt={app.resume_updated_at}
          />
          <FileUpload
            id={numId}
            field="cover_letter"
            label="Cover letter"
            uploadedAt={app.cover_letter_updated_at}
          />
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-medium text-zinc-700">Timeline</h2>
        {app.timeline_entries.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No transitions yet.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {app.timeline_entries.map((entry) => (
              <li key={entry.id} className="flex items-baseline gap-3 text-sm">
                <span className="font-mono text-xs text-zinc-400">
                  {formatDate(entry.created_at)}
                </span>
                <span className="text-zinc-700">
                  <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs">
                    {statusLabel(entry.from_status)}
                  </code>{" "}
                  →{" "}
                  <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs">
                    {statusLabel(entry.to_status)}
                  </code>
                </span>
                {entry.note ? (
                  <span className="text-zinc-500">— {entry.note}</span>
                ) : null}
                <span className="ml-auto text-xs text-zinc-400">{timeAgo(entry.created_at)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right text-zinc-900">{value}</dd>
    </div>
  );
}
