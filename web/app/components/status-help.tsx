import {
  PERMANENT_STATUSES,
  statusBadgeClass,
  statusDescription,
  statusLabel,
} from "@/app/lib/format";
import type { Status } from "@/app/lib/types";

/**
 * ⓘ disclosure explaining the current status and every status reachable from
 * it. Native <details> keeps it JS-free and keyboard-accessible, and — unlike
 * a hover tooltip — the list stays open while the user reads and works on
 * touch screens. Not a <button>, so the e2e transition selectors
 * (getByRole("button", { name: /status/i })) can never match it.
 */
export function StatusHelp({
  current,
  nextStates,
}: {
  current: Status;
  nextStates: Status[];
}) {
  return (
    <details className="relative inline-block align-middle">
      <summary
        aria-label="What do these statuses mean?"
        title="What do these statuses mean?"
        className="list-none cursor-help select-none text-ink-soft/50 transition-colors hover:text-ink-soft focus-visible:text-ink-soft focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cobalt [&::-webkit-details-marker]:hidden"
      >
        ⓘ
      </summary>
      <div className="absolute left-0 top-full z-10 mt-2 w-80 max-w-[85vw] border border-dune bg-linen p-4 shadow-lg">
        <p className="kk-label">Status meanings</p>
        <dl className="mt-3 space-y-3">
          <Item status={current} isCurrent />
          {nextStates.map((status) => (
            <Item key={status} status={status} />
          ))}
        </dl>
      </div>
    </details>
  );
}

function Item({ status, isCurrent = false }: { status: Status; isCurrent?: boolean }) {
  return (
    <div>
      <dt className="flex items-center gap-2">
        <span
          className={`inline-flex items-center px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusBadgeClass(status)}`}
        >
          {statusLabel(status)}
        </span>
        {isCurrent ? (
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-soft">
            current
          </span>
        ) : null}
        {PERMANENT_STATUSES.has(status) ? (
          <span className="font-mono text-[10px] uppercase tracking-widest text-red-700/70">
            permanent
          </span>
        ) : null}
      </dt>
      <dd className="mt-1 text-sm leading-snug text-ink-soft">{statusDescription(status)}</dd>
    </div>
  );
}
