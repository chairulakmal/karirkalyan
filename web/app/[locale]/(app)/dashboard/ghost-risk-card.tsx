"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { transitionStatus } from "@/app/lib/actions";
import { InfoPopover } from "@/app/components/info-popover";
import type { GhostRisk, GhostRiskEntry } from "@/app/lib/types";

/*
 * The applications that have gone quiet for longer than the user's own p90
 * response time for the stage they're in — and, next to each, the one move that
 * clears it. Marking `ghosted` from here is deliberate: the point of the card is
 * to empty itself. `ghosted` is not in CONFIRM_REQUIRED (it's revivable, and the
 * detail page fires it on a single click too), so there's no dialog to mirror.
 *
 * The server ranks the rows; this component never re-sorts or re-judges them.
 * Every number on screen — the threshold, whether it is personal or a default —
 * comes from Applications::GhostRiskQuery.
 */
export function GhostRiskCard({ risk }: { risk: GhostRisk }) {
  const t = useTranslations("dashboard.ghostRisk");
  const ts = useTranslations("status");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  if (risk.at_risk.length === 0) return null;

  function markGhosted(entry: GhostRiskEntry) {
    setError(null);
    setPendingId(entry.id);
    startTransition(async () => {
      const result = await transitionStatus(entry.id, "ghosted", entry.lock_version);
      setPendingId(null);
      if (result.ok) return;
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
        <p className="kk-label text-danger">{t("eyebrow")}</p>
        <span className="inline-block align-middle">
          <InfoPopover label={t("explainAria")}>
            <div className="space-y-2 font-sans text-sm leading-relaxed text-ink-soft">
              <p>{t("explain")}</p>
              <ul className="space-y-1">
                {(["applied", "phone_screen"] as const).map((stage) => (
                  <li key={stage} className="font-mono text-xs">
                    {t(`basis.${risk.basis[stage]}`, {
                      stage: ts(`label.${stage}`),
                      days: risk.thresholds[stage],
                      count: risk.sample_sizes[stage],
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
        {risk.at_risk.map((entry) => (
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
                  days: Math.round(entry.days_in_stage),
                  stage: ts(`label.${entry.status}`),
                  threshold: entry.threshold,
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => markGhosted(entry)}
              disabled={isPending}
              className="inline-flex min-h-10 shrink-0 items-center bg-danger/10 px-3 py-1 text-xs font-medium text-danger ring-1 ring-inset ring-danger/30 transition hover:bg-danger/20 disabled:opacity-50"
            >
              {pendingId === entry.id ? t("marking") : t("markGhosted")}
            </button>
          </li>
        ))}
      </ul>

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
    </section>
  );
}
