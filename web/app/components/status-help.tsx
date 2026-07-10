import { getTranslations } from "next-intl/server";
import { InfoPopover } from "@/app/components/info-popover";
import { PERMANENT_STATUSES, statusBadgeClass } from "@/app/lib/format";
import type { Status } from "@/app/lib/types";

/**
 * Explains the current status and every status reachable from it, inside the
 * shared ⓘ disclosure (see info-popover.tsx for why it's a <details>).
 */
export async function StatusHelp({
  current,
  nextStates,
}: {
  current: Status;
  nextStates: Status[];
}) {
  const t = await getTranslations("status");

  return (
    <InfoPopover label={t("meaningsAria")}>
      <p className="kk-label">{t("meanings")}</p>
      <dl className="mt-3 space-y-3">
        <Item status={current} isCurrent />
        {nextStates.map((status) => (
          <Item key={status} status={status} />
        ))}
      </dl>
    </InfoPopover>
  );
}

async function Item({ status, isCurrent = false }: { status: Status; isCurrent?: boolean }) {
  const t = await getTranslations("status");

  return (
    <div>
      <dt className="flex items-center gap-2">
        <span
          className={`inline-flex items-center px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusBadgeClass(status)}`}
        >
          {t(`label.${status}`)}
        </span>
        {isCurrent ? (
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-soft">
            {t("current")}
          </span>
        ) : null}
        {PERMANENT_STATUSES.has(status) ? (
          <span className="font-mono text-[10px] uppercase tracking-widest text-danger/70">
            {t("permanent")}
          </span>
        ) : null}
      </dt>
      <dd className="mt-1 text-sm leading-snug text-ink-soft">{t(`description.${status}`)}</dd>
    </div>
  );
}
