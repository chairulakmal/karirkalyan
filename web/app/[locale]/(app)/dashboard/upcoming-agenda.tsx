"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { distanceFromNow, formatDate, isOverdue } from "@/app/lib/format";
import { formatJstDateTime } from "@/app/lib/timezone";
import type { AgendaItem } from "@/app/lib/types";

const VISIBLE_COUNT = 3;

/*
 * The dated commitments already captured but scattered (follow-ups,
 * interviews, the residence clock), given one chronological read. The API
 * sends every item it has; this component is the one that decides how many
 * of them earn a place above the fold. It shows the three closest to today
 * (by absolute distance, so a week-overdue follow-up outranks an interview
 * three months out) and folds the rest behind "Show more" rather than
 * growing the dashboard by the length of the agenda.
 */
export function UpcomingAgenda({ upcoming }: { upcoming: AgendaItem[] }) {
  const t = useTranslations("dashboard.upcoming");
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);

  if (upcoming.length === 0) return null;

  const sorted = [...upcoming].sort(
    (a, b) => distanceFromNow(a.at) - distanceFromNow(b.at),
  );
  const visible = expanded ? sorted : sorted.slice(0, VISIBLE_COUNT);
  const hiddenCount = sorted.length - VISIBLE_COUNT;

  return (
    <section className="space-y-3">
      <h2 className="kk-label">{t("title")}</h2>
      <ul className="divide-y divide-dune border border-dune bg-linen">
        {visible.map((item, i) => {
          // Interviews are future-only, so never overdue; a stale follow-up or
          // an expired residence date shouts in danger, an upcoming one in
          // saffron, the same two colours the list uses for follow-ups.
          const overdue = item.type !== "interview" && isOverdue(item.at);
          return (
            <li key={i}>
              <Link
                href={item.type === "residence" ? "/settings" : `/applications/${item.application_id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-sand/60"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium text-ink-soft ring-1 ring-inset ring-midnight/20">
                      {t(`type.${item.type}`)}
                    </span>
                    <p className="truncate text-sm font-medium text-midnight">
                      {item.type === "residence" ? t("residenceLabel") : item.company}
                    </p>
                  </div>
                  {item.role ? (
                    <p className="mt-0.5 truncate text-xs text-ink-soft">{item.role}</p>
                  ) : null}
                </div>
                <div className="shrink-0 text-right font-mono text-xs">
                  {item.type === "interview" ? (
                    <span className="text-midnight">{formatJstDateTime(item.at)}</span>
                  ) : overdue ? (
                    <span className="font-medium text-danger">
                      {t("overdue")} · {formatDate(item.at, locale)}
                    </span>
                  ) : (
                    <span className="font-medium text-saffron-ink">{formatDate(item.at, locale)}</span>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-xs font-medium text-cobalt underline decoration-dune underline-offset-4 transition hover:decoration-cobalt"
        >
          {expanded ? t("showLess") : t("showMore", { count: hiddenCount })}
        </button>
      )}
    </section>
  );
}
