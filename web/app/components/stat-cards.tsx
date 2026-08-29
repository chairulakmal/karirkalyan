import { getTranslations } from "next-intl/server";
import type { DashboardStats } from "@/app/lib/types";

// The four figures this block reads, and only those: the caller passes the whole
// dashboard payload, but nothing here may reach for `upcoming` or `user`, or
// /board would be fetching an endpoint for one section and rendering another.
type Figures = Pick<
  DashboardStats,
  "response_rate" | "screening_success_rate" | "ghost_rate" | "avg_days_in_stage"
>;

/**
 * Response rate, screening success rate, time-in-stage and ghost rate, as one
 * row of tiles. Rendered by both /dashboard and /board — see SPEC.md § Dashboard
 * layout and § Board view.
 *
 * The figures are account-wide, not a summary of whatever list sits beside them,
 * so the same numbers are correct on a filtered dashboard and on a truncated
 * board. Each card hides until it has data, and the row itself disappears when
 * none of them do: a fresh account reads better empty than as four "0%".
 *
 * The screening success rate sits directly beside the response rate because it
 * is that number without the rejections, and neither is worth much alone. The
 * gap between them separates a targeting problem from a resume problem
 * (SPEC.md § The dashboard payload).
 */
export async function StatCards({ stats }: { stats: Figures | null }) {
  const t = await getTranslations("stats");

  if (
    !stats ||
    (stats.response_rate == null &&
      stats.screening_success_rate == null &&
      stats.avg_days_in_stage == null &&
      stats.ghost_rate == null)
  ) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.response_rate != null && (
        <StatCard label={t("responseRate")} value={`${stats.response_rate}%`} />
      )}
      {stats.screening_success_rate != null && (
        <StatCard label={t("screeningSuccessRate")} value={`${stats.screening_success_rate}%`} />
      )}
      {stats.avg_days_in_stage != null && (
        <StatCard label={t("timeInStage")} value={t("daysValue", { days: stats.avg_days_in_stage })} />
      )}
      {stats.ghost_rate != null && (
        <StatCard
          label={t("ghostRate")}
          value={`${stats.ghost_rate}%`}
          danger={stats.ghost_rate >= 30}
        />
      )}
    </div>
  );
}

// A compact stat tile. `danger` tints a bad ghost rate; nothing else changes.
function StatCard({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="border border-dune bg-linen p-3">
      <p className="kk-label">{label}</p>
      <p className={`mt-1 font-mono text-xl ${danger ? "text-danger" : "text-midnight"}`}>{value}</p>
    </div>
  );
}
