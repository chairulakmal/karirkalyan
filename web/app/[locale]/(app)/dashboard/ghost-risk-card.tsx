"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { transitionStatus } from "@/app/lib/actions";
import { InfoPopover } from "@/app/components/info-popover";
import { useToast } from "@/app/components/toast";
import type { GhostRisk, GhostRiskEntry } from "@/app/lib/types";

const VISIBLE_COUNT = 3;

/*
 * The applications that have gone quiet for longer than their stage allows, and
 * next to each, the one move that clears it. Marking `ghosted` from here is
 * deliberate: the point of the card is to empty itself. `ghosted` is not in
 * CONFIRM_REQUIRED (it's revivable, and the detail page fires it on a single
 * click too), so there's no dialog to mirror.
 *
 * The server ranks the rows longest-silence-first; this component re-ranks
 * them for display only (fewest business days in stage first, i.e. the most
 * recently touched of the at-risk set) and caps the visible list at three,
 * folding the rest behind "Show more" rather than growing the card by the
 * length of the risk set.
 *
 * Every number on screen comes from Applications::GhostRiskQuery, and every one
 * of them is a count of BUSINESS days: weekends, Japanese national holidays,
 * Golden Week, Obon and the New Year shutdown are not silence, because nobody
 * was there to answer. The copy says "working days" for that reason.
 */
export function GhostRiskCard({ risk }: { risk: GhostRisk }) {
  const t = useTranslations("dashboard.ghostRisk");
  const ts = useTranslations("status");
  const tErrors = useTranslations("errors");
  const tt = useTranslations("transitions");
  const router = useRouter();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);

  if (risk.at_risk.length === 0) return null;

  const sorted = [...risk.at_risk].sort(
    (a, b) => a.business_days_in_stage - b.business_days_in_stage,
  );
  const visible = expanded ? sorted : sorted.slice(0, VISIBLE_COUNT);
  const hiddenCount = sorted.length - VISIBLE_COUNT;

  function markGhosted(entry: GhostRiskEntry) {
    // The buttons are no longer `disabled` while a move is in flight (that
    // reaches the one the user just pressed, and a disabled element cannot hold
    // focus), so the handler is what stops a double submit. Same rule the list's
    // filter bar documents at length.
    if (isPending) return;
    setError(null);
    setPendingId(entry.id);
    startTransition(async () => {
      const result = await transitionStatus(entry.id, "ghosted", entry.lock_version);
      setPendingId(null);
      if (result.ok) {
        // SPEC.md § Toast feedback says one toast per write. This surface was
        // silent: the row simply vanished on revalidate, which reads as the app
        // losing the record rather than as the move succeeding.
        toast.success(tt("moved", { label: ts("label.ghosted") }));
        return;
      }
      if (result.status === 409) {
        // Stale lock — the row moved under us. A refresh re-runs the query, and
        // if it moved on its own the application drops off this list anyway.
        setError(tErrors("refreshingStale"));
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <section className="border border-danger/40 bg-danger/5 p-5">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 className="kk-label text-danger">{t("eyebrow")}</h2>
        <span className="inline-block align-middle">
          <InfoPopover label={t("explainAria")}>
            <div className="space-y-2 font-sans text-sm leading-relaxed text-ink-soft">
              <p>{t("explain")}</p>
              <ul className="space-y-1">
                {(["applied", "phone_screen"] as const).map((stage) => (
                  <li key={stage} className="font-mono text-xs">
                    {t("threshold", {
                      stage: ts(`label.${stage}`),
                      days: risk.thresholds[stage],
                    })}
                  </li>
                ))}
              </ul>
            </div>
          </InfoPopover>
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        {t("summary", { count: risk.at_risk.length })}
      </p>

      <ul className="mt-4 divide-y divide-danger/20 border-t border-danger/20">
        {visible.map((entry) => (
          <li
            key={entry.id}
            className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3"
          >
            <div className="min-w-0">
              <Link
                href={`/applications/${entry.id}`}
                className="text-sm font-medium text-midnight underline decoration-dune underline-offset-4 transition hover:decoration-cobalt"
              >
                {entry.company}
              </Link>
              <span className="ml-2 text-sm text-ink-soft">{entry.role}</span>
              <p className="mt-0.5 font-mono text-xs text-ink-soft">
                {t("silence", {
                  days: entry.business_days_in_stage,
                  stage: ts(`label.${entry.status}`),
                  threshold: entry.threshold,
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => markGhosted(entry)}
              aria-busy={pendingId === entry.id}
              className="inline-flex min-h-10 shrink-0 items-center bg-danger/10 px-3 py-1 text-xs font-medium text-danger ring-1 ring-inset ring-danger/30 transition hover:bg-danger/20"
            >
              {pendingId === entry.id ? t("marking") : t("markGhosted")}
            </button>
          </li>
        ))}
      </ul>

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-3 text-xs font-medium text-danger underline decoration-danger/40 underline-offset-4 transition hover:decoration-danger"
        >
          {expanded ? t("showLess") : t("showMore", { count: hiddenCount })}
        </button>
      )}

      {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
    </section>
  );
}
