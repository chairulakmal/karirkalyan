import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { apiFetch } from "@/app/lib/api";
import { formatDate, prettyUrl, statusBadgeClass, timeAgo } from "@/app/lib/format";
import type { ApplicationWithDetail, TransitionTable } from "@/app/lib/types";
import { StatusHelp } from "@/app/components/status-help";
import { TransitionButtons } from "./transition-buttons";
import { FileUpload } from "./file-upload";
import { DeleteButton } from "./delete-button";
import { DetailsEditor } from "./details-editor";

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, ts, locale, tableRes] = await Promise.all([
    getTranslations("detail"),
    getTranslations("status"),
    getLocale(),
    apiFetch<TransitionTable>("/transitions"),
  ]);
  const res = await apiFetch<ApplicationWithDetail>(`/applications/${id}`);

  if (!res.ok) {
    if (res.status === 404) notFound();
    return (
      <div className="border border-danger/40 bg-danger/10 p-5 text-sm text-danger">
        {t("failedToLoad", { message: res.error })}
      </div>
    );
  }
  const app = res.data;
  const numId = Number(id);

  /* The two FSM facts this page reads off the fetched table rather than a copy
     (SPEC.md § The transition table). Both degrade to `[]` when the table fails
     or predates the field, and each consumer reads that as *unknown* — see the
     comments at their call sites for what silence costs. */
  const table = tableRes.ok ? tableRes.data : null;
  const activeStates = table?.active_states ?? [];
  const terminalStates = table?.terminal_states ?? [];

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-dune pb-6">
        <div className="min-w-0">
          <p className="kk-label">{t("eyebrow")}</p>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="truncate text-3xl">{app.company}</h1>
            <span
              title={ts(`description.${app.status}`)}
              className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${statusBadgeClass(app.status)}`}
            >
              {ts(`label.${app.status}`)}
            </span>
          </div>
          <p className="mt-1 text-ink-soft">{app.role}</p>
          {app.url ? (
            <a
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
              title={app.url}
              className="mt-1 inline-block max-w-full truncate font-mono text-xs text-cobalt underline underline-offset-4 hover:text-cobalt-2"
            >
              {prettyUrl(app.url)}
            </a>
          ) : null}
        </div>
        {/* flex-wrap + justify-end: the delete confirm block goes basis-full
            below sm, wrapping onto its own right-aligned row — side by side
            with the back link it overflows a 375px viewport in Japanese. */}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Link
            href="/dashboard"
            className="border border-dune bg-linen px-3 py-1.5 text-sm text-ink-soft hover:bg-sand"
          >
            {t("backToDashboard")}
          </Link>
          <DeleteButton id={numId} />
        </div>
      </header>

      <section className="border border-dune bg-linen p-5">
        <div className="flex items-center gap-2">
          <p className="kk-label">{t("transition")}</p>
          {/* A failed table costs the "permanent" badge here and the
              permanent/reopenable line in the confirm below — the help still
              explains every status, it just stops making a claim it cannot
              back. Never the reverse: silence, not a guess. */}
          <StatusHelp
            current={app.status}
            nextStates={app.valid_next_states}
            terminalStates={terminalStates}
          />
        </div>
        {app.valid_next_states.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">
            {t.rich("finalState", {
              label: ts(`label.${app.status}`),
              description: ts(`description.${app.status}`),
              b: (chunks) => <span className="font-medium text-midnight">{chunks}</span>,
            })}
          </p>
        ) : (
          <TransitionButtons
            id={numId}
            lockVersion={app.lock_version}
            validNextStates={app.valid_next_states}
            currentStatus={app.status}
            terminalStates={terminalStates}
          />
        )}
      </section>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* `active_states` only decides whether an overdue follow-up shouts, so
            a failed table costs that one emphasis rather than the page — the
            record itself is what the reader came for. */}
        <DetailsEditor
          id={numId}
          lockVersion={app.lock_version}
          status={app.status}
          activeStates={activeStates}
          company={app.company}
          role={app.role}
          url={app.url}
          notes={app.notes}
          followUpAt={app.follow_up_at}
          appliedAt={app.applied_at}
          createdAt={app.created_at}
          channel={app.channel}
          agencyName={app.agency_name}
          japaneseLevel={app.japanese_level}
          compAnnualMinYen={app.comp_annual_min_yen}
          compAnnualMaxYen={app.comp_annual_max_yen}
          compMonthsGuaranteed={app.comp_months_guaranteed}
          compMonthsVariable={app.comp_months_variable}
        />

        <div className="border border-dune bg-linen p-5">
          <p className="kk-label">{t("documents")}</p>
          <FileUpload
            id={numId}
            field="resume"
            label={t("resume")}
            uploadedAt={app.resume_updated_at}
          />
          <FileUpload
            id={numId}
            field="cover_letter"
            label={t("coverLetter")}
            uploadedAt={app.cover_letter_updated_at}
          />
        </div>
      </section>

      {/* The stripped posting text captured at prefill time. Postings get taken
          down mid-process, usually right when the user preps for the interview
          they earned with them — this copy is what survives the deletion.
          Collapsed by default: reference material, not the page's subject. */}
      {app.posting_snapshot ? (
        <section className="border border-dune bg-linen p-5">
          <details>
            <summary className="kk-label cursor-pointer select-none">
              {t("postingSnapshot")}
            </summary>
            <p className="mt-1 text-xs text-ink-soft">{t("postingSnapshotHint")}</p>
            <p className="mt-3 whitespace-pre-wrap text-sm text-midnight">
              {app.posting_snapshot}
            </p>
          </details>
        </section>
      ) : null}

      <section className="border border-dune bg-linen p-5">
        <p className="kk-label">{t("timeline")}</p>
        {app.timeline_entries.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">{t("noTransitions")}</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {app.timeline_entries.map((entry) => (
              <li key={entry.id} className="flex items-baseline gap-3 text-sm">
                <span className="font-mono text-xs text-ink-soft">
                  {formatDate(entry.created_at, locale)}
                </span>
                {/* Same-status entries are events (e.g. the follow-up reminder),
                    not transitions — "Applied → Applied" would read like a bug. */}
                <span className="text-midnight">
                  <code className="bg-sand px-1.5 py-0.5 font-mono text-xs">
                    {ts(`label.${entry.from_status}`)}
                  </code>
                  {entry.from_status !== entry.to_status ? (
                    <>
                      {" "}
                      →{" "}
                      <code className="bg-sand px-1.5 py-0.5 font-mono text-xs">
                        {ts(`label.${entry.to_status}`)}
                      </code>
                    </>
                  ) : null}
                </span>
                {entry.note ? (
                  <span className="text-ink-soft">— {entry.note}</span>
                ) : null}
                <span className="ml-auto font-mono text-xs text-ink-soft">
                  {timeAgo(entry.created_at, locale)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
