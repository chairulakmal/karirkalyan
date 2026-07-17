import { getTranslations } from "next-intl/server";
import { InfoPopover } from "@/app/components/info-popover";
import { statusBadgeClass } from "@/app/lib/format";
import type { Status } from "@/app/lib/types";

/**
 * Explains the current status and every status reachable from it, inside the
 * shared ⓘ disclosure (see info-popover.tsx for why it's a <details>).
 *
 * `terminalStates` comes from the fetched transition table rather than a copy
 * of ApplicationFSM::TERMINAL_STATES here (SPEC.md § The transition table). An
 * empty list means the table didn't arrive, not that nothing is permanent — so
 * no badge renders, which is the silence the caller wants over a false claim.
 */
export async function StatusHelp({
  current,
  nextStates,
  terminalStates,
}: {
  current: Status;
  nextStates: Status[];
  terminalStates: Status[];
}) {
  const t = await getTranslations("status");
  const terminal = new Set(terminalStates);

  return (
    <InfoPopover label={t("meaningsAria")}>
      <p className="kk-label">{t("meanings")}</p>
      <dl className="mt-3 space-y-3">
        <Item status={current} isTerminal={terminal.has(current)} isCurrent />
        {nextStates.map((status) => (
          <Item key={status} status={status} isTerminal={terminal.has(status)} />
        ))}
      </dl>
    </InfoPopover>
  );
}

async function Item({
  status,
  isTerminal,
  isCurrent = false,
}: {
  status: Status;
  isTerminal: boolean;
  isCurrent?: boolean;
}) {
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
        {isTerminal ? (
          <span className="font-mono text-[10px] uppercase tracking-widest text-danger/70">
            {t("permanent")}
          </span>
        ) : null}
      </dt>
      <dd className="mt-1 text-sm leading-snug text-ink-soft">{t(`description.${status}`)}</dd>
    </div>
  );
}
