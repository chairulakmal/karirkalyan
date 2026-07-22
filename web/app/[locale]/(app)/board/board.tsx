"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { transitionStatus } from "@/app/lib/actions";
import { jobBoardLabel, stageAge, statusBadgeClass } from "@/app/lib/format";
import { excerpt } from "@/app/lib/excerpt";
import { useToast } from "@/app/components/toast";
import { CONFIRM_REQUIRED, canRevive } from "@/app/lib/transitions";
import type { Application, Status, TransitionTable } from "@/app/lib/types";

// The two candidate-side columns where a stalled item is the user's own to move
// (past `applied`, the next move is the company's, which ghost risk already
// watches). Only these get the triage facts and the stalest-first sort.
const TRIAGE_COLUMNS: ReadonlySet<Status> = new Set(["wishlist", "draft"]);

/*
 * The Kanban board. Columns are the seven active statuses; the six closed
 * statuses collapse into the rail below. Moves are FSM transitions: drag
 * works card → active column with legal targets read from the fetched table,
 * and every card's menu lists all legal next states — including the closed
 * ones drag refuses — making it the accessible and only complete path.
 * The table only decides what looks droppable; the server re-validates every
 * transition regardless. See SPEC.md § Board view.
 */

type Move = { id: number; to: Status };

// Board-only display order. The grid wraps at four, so this groups row one as
// the interview loop and row two as everything outside it (not yet applied,
// or done interviewing) instead of funnel order. Membership still comes from
// the fetched `active_states`; a status missing here sorts after the ranked
// ones instead of disappearing.
// fsm-allow: board display order only; membership comes from fetched active_states.
const COLUMN_ORDER: readonly Status[] = [
  "applied",
  "phone_screen",
  "technical",
  "final_round",
  "wishlist",
  "draft",
  "offer",
];

function columnRank(s: Status): number {
  const i = COLUMN_ORDER.indexOf(s);
  return i === -1 ? COLUMN_ORDER.length : i;
}

export function Board({
  applications,
  table,
}: {
  applications: Application[];
  table: TransitionTable;
}) {
  const t = useTranslations("board");
  const ts = useTranslations("status");
  const tt = useTranslations("transitions");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const toast = useToast();
  const [dragging, setDragging] = useState<{ id: number; from: Status } | null>(null);
  const [, startMove] = useTransition();

  // The board renders from this optimistic view: a move shows instantly, and
  // when the action settles the view converges on the server state — which on
  // failure is the state before the move, so the card snaps home by itself.
  const [optimisticApps, applyMove] = useOptimistic(
    applications,
    (state: Application[], move: Move) =>
      state.map((a) => (a.id === move.id ? { ...a, status: move.to } : a)),
  );

  function move(app: Application, to: Status, note?: string) {
    startMove(async () => {
      applyMove({ id: app.id, to });
      const result = await transitionStatus(app.id, to, app.lock_version, note);
      if (result.ok) {
        // The optimistic move already showed; confirm it, so a successful drag
        // is no longer silent.
        toast.success(tt("moved", { label: ts(`label.${to}`) }));
        return;
      }
      // The optimistic card snaps back on its own when the action settles; the
      // toast is where its reason finally gets spoken (it used to be an inline
      // notice only the board had).
      if (result.status === 409) {
        // Stale optimistic lock: this board's copy of the row is out of date
        // by definition, so refresh to pull fresh lock_versions in.
        toast.error(tErrors("refreshingStale"));
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  // Server (cursor) order within each column by default: position is not API
  // data, and inventing a client-side order would be a second source of truth.
  // The two triage columns are the exception: they sort stalest-first on
  // `days_in_stage`, which is itself a server field, so the order is still
  // derived from server data, not invented here.
  const byStatus = new Map<Status, Application[]>();
  for (const app of optimisticApps) {
    const bucket = byStatus.get(app.status);
    if (bucket) bucket.push(app);
    else byStatus.set(app.status, [app]);
  }

  const columns = [...table.active_states].sort((a, b) => columnRank(a) - columnRank(b));
  // Everything the API knows that isn't an active column — derived from the
  // fetched state list, so nothing here enumerates the FSM's vocabulary.
  const closed = table.states.filter((s) => !table.active_states.includes(s));
  const closedWithCards = closed.filter((s) => (byStatus.get(s) ?? []).length > 0);

  function isLegalTarget(column: Status): boolean {
    if (!dragging || dragging.from === column) return false;
    return (table.transitions[dragging.from] ?? []).includes(column);
  }

  if (optimisticApps.length === 0) {
    return (
      <div className="border border-dashed border-dune bg-linen p-12 text-center">
        <p className="text-ink-soft">{t("empty")}</p>
        <Link
          href="/applications/new"
          className="mt-3 inline-block text-sm font-medium text-cobalt underline underline-offset-4 hover:text-cobalt-2"
        >
          {t("addFirst")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 gap-3 pb-4 sm:grid-cols-2 lg:grid-cols-4">
        {columns.map((status) => {
          const isTriage = TRIAGE_COLUMNS.has(status);
          const cards = [...(byStatus.get(status) ?? [])];
          // Stalest-first on the server's days_in_stage; a null age sorts last.
          if (isTriage) {
            cards.sort((a, b) => (b.days_in_stage ?? -1) - (a.days_in_stage ?? -1));
          }
          const legal = isLegalTarget(status);
          return (
            <section
              key={status}
              aria-label={ts(`label.${status}`)}
              onDragOver={(e) => {
                if (legal) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (!dragging || !legal) return;
                const app = optimisticApps.find((a) => a.id === dragging.id);
                setDragging(null);
                if (app) move(app, status);
              }}
              className={`flex flex-col border transition ${
                legal ? "border-cobalt bg-cobalt/5" : "border-dune bg-sand/30"
              } ${dragging && !legal ? "opacity-60" : ""}`}
            >
              <header className="flex items-center justify-between gap-2 border-b border-dune px-3 py-2">
                <span
                  title={ts(`description.${status}`)}
                  className={`inline-flex items-center px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusBadgeClass(status)}`}
                >
                  {ts(`label.${status}`)}
                </span>
                <span className="font-mono text-xs text-ink-soft">{cards.length}</span>
              </header>
              <ul className="min-h-24 flex-1 space-y-2 p-2">
                {cards.map((app) => (
                  <Card
                    key={app.id}
                    app={app}
                    targets={table.transitions[app.status] ?? []}
                    terminalStates={table.terminal_states ?? []}
                    revivable={canRevive(app.status, table)}
                    triage={isTriage}
                    draggable
                    dragged={dragging?.id === app.id}
                    onDragStart={() => setDragging({ id: app.id, from: app.status })}
                    onDragEnd={() => setDragging(null)}
                    onMove={(to, note) => move(app, to, note)}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {closedWithCards.length > 0 && (
        <section>
          <h2 className="kk-label">{t("closedTitle")}</h2>
          {/* Not a drop target: moves into closed states carry intent that a
              flick of the wrist shouldn't express — they go through the card
              menu, which confirms. Moves *out* (revival) do too. */}
          <div className="mt-3 space-y-2">
            {closedWithCards.map((status) => {
              const cards = byStatus.get(status) ?? [];
              return (
                <details key={status} className="border border-dune bg-linen">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 transition hover:bg-sand/60">
                    <span
                      title={ts(`description.${status}`)}
                      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusBadgeClass(status)}`}
                    >
                      {ts(`label.${status}`)}
                    </span>
                    <span className="font-mono text-xs text-ink-soft">{cards.length}</span>
                  </summary>
                  <ul className="grid gap-2 border-t border-dune p-3 sm:grid-cols-2 lg:grid-cols-3">
                    {cards.map((app) => (
                      <Card
                        key={app.id}
                        app={app}
                        targets={table.transitions[app.status] ?? []}
                        terminalStates={table.terminal_states ?? []}
                        revivable={canRevive(app.status, table)}
                        onMove={(to, note) => move(app, to, note)}
                      />
                    ))}
                  </ul>
                </details>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function Card({
  app,
  targets,
  terminalStates,
  revivable,
  triage = false,
  draggable = false,
  dragged = false,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  app: Application;
  targets: Status[];
  terminalStates: Status[];
  revivable: boolean;
  triage?: boolean;
  draggable?: boolean;
  dragged?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onMove: (to: Status, note?: string) => void;
}) {
  const t = useTranslations("board");
  const locale = useLocale();
  return (
    <li
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(app.id));
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.();
      }}
      onDragEnd={onDragEnd}
      className={`relative border border-dune bg-linen transition ${
        dragged ? "opacity-40" : ""
      } ${draggable ? "cursor-grab" : ""}`}
    >
      <Link href={`/applications/${app.id}`} className="block px-3 py-2.5 pr-10 transition hover:bg-sand/60">
        <p className="truncate font-serif text-sm font-medium text-midnight">{app.company}</p>
        <p className="mt-0.5 truncate text-xs text-ink-soft">{app.role}</p>
        {/* Triage facts on the two candidate-side columns only: a notes excerpt,
            the source it came from, and how long it has sat here: enough to
            decide the next move without opening the card. */}
        {triage ? (
          <>
            {app.notes ? (
              <p className="mt-1.5 line-clamp-2 text-xs text-ink-soft/90">{excerpt(app.notes, 100)}</p>
            ) : null}
            <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-ink-soft">
              <span className="truncate">{jobBoardLabel(app.source, t("noBoard"))}</span>
              {app.days_in_stage !== null ? (
                <span className="shrink-0 font-mono">{stageAge(app.days_in_stage, locale)}</span>
              ) : null}
            </div>
          </>
        ) : null}
      </Link>
      {targets.length > 0 && (
        <CardMenu app={app} targets={targets} terminalStates={terminalStates} revivable={revivable} onMove={onMove} />
      )}
    </li>
  );
}

// The focusable move menu: lists every legal next state, with the same
// confirm-before-closing and reason-before-reviving semantics as the detail
// page's transition buttons (shared sets in app/lib/transitions.ts).
// `terminalStates` is the fetched table's; empty means the table didn't arrive,
// so the confirm claims neither permanence nor reopenability.
function CardMenu({
  app,
  targets,
  terminalStates,
  revivable,
  onMove,
}: {
  app: Application;
  targets: Status[];
  terminalStates: Status[];
  revivable: boolean;
  onMove: (to: Status, note?: string) => void;
}) {
  const t = useTranslations("board");
  const ts = useTranslations("status");
  const tt = useTranslations("transitions");
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<Status | null>(null);
  const [reason, setReason] = useState("");

  const isRevival = revivable;
  // Catalog entries under `transitions.reasons` are JSON arrays → t.raw.
  const presets: string[] = isRevival ? tt.raw(`reasons.${app.status}`) : [];

  function close() {
    setOpen(false);
    setConfirming(null);
    setReason("");
  }

  function pick(to: Status) {
    if (isRevival && to === "applied") {
      setConfirming("applied");
      setReason("");
    } else if (CONFIRM_REQUIRED.has(to)) {
      setConfirming(to);
    } else {
      close();
      onMove(to);
    }
  }

  function confirm(to: Status) {
    const note = confirming === "applied" && isRevival ? reason.trim() : undefined;
    close();
    onMove(to, note);
  }

  return (
    <div
      className="absolute right-1 top-1"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) close();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("moveMenu", { company: app.company })}
        onClick={() => (open ? close() : setOpen(true))}
        className="flex h-8 w-8 items-center justify-center text-ink-soft transition hover:bg-sand hover:text-midnight"
      >
        <span aria-hidden>⋯</span>
      </button>

      {open && (
        <div
          role="menu"
          // z-20, not z-10: the ancestors here create no stacking context, so
          // this competes at the root against the sticky tab bar's z-10 — at
          // equal z the later-rendered bar would paint over (and swallow taps
          // meant for) a bottom-row card's menu on phone widths.
          className="absolute right-0 z-20 mt-1 w-56 border border-dune bg-linen shadow-lg"
        >
          {confirming === null ? (
            <>
              <p className="border-b border-dune px-3 py-2 text-xs text-ink-soft">
                {t("menuTitle")}
              </p>
              {targets.map((to) => (
                <button
                  key={to}
                  type="button"
                  role="menuitem"
                  onClick={() => pick(to)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition hover:bg-sand/60"
                >
                  <span
                    className={`inline-flex items-center px-2 py-0.5 font-medium ring-1 ring-inset ${statusBadgeClass(to)}`}
                  >
                    {ts(`label.${to}`)}
                  </span>
                </button>
              ))}
            </>
          ) : confirming === "applied" && isRevival ? (
            <div className="space-y-2 p-3">
              <p className="text-xs font-medium text-ink-soft">{tt("reopenPrompt")}</p>
              <div className="flex flex-wrap gap-1.5">
                {presets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setReason(preset)}
                    className={`px-2 py-1 text-xs ring-1 ring-inset ring-midnight/20 transition ${
                      reason === preset
                        ? "bg-cobalt text-linen"
                        : "bg-sand/40 text-ink-soft hover:text-midnight"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={tt("customReason")}
                className="w-full border border-dune bg-linen px-2 py-1.5 font-mono text-xs text-midnight placeholder:text-ink-soft/50"
              />
              <ConfirmCancel
                confirmDisabled={reason.trim().length === 0}
                onConfirm={() => confirm("applied")}
                onCancel={() => setConfirming(null)}
              />
            </div>
          ) : (
            <div className="space-y-2 p-3">
              <p className="text-xs text-ink-soft">
                {tt.rich("confirmMark", {
                  label: ts(`label.${confirming}`),
                  description: ts(`description.${confirming}`),
                  b: (chunks) => <span className="font-medium text-midnight">{chunks}</span>,
                  dim: (chunks) => <span className="text-ink-soft/80">{chunks}</span>,
                })}{" "}
                {terminalStates.length === 0 ? null : terminalStates.includes(confirming) ? (
                  <span className="text-danger/80">{tt("permanentWarning")}</span>
                ) : (
                  <span className="text-ink-soft/70">{tt("reopenable")}</span>
                )}
              </p>
              <ConfirmCancel
                danger
                onConfirm={() => confirm(confirming)}
                onCancel={() => setConfirming(null)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ConfirmCancel({
  danger = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: {
  danger?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const tt = useTranslations("transitions");
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onConfirm}
        disabled={confirmDisabled}
        className={`px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition disabled:cursor-not-allowed disabled:opacity-40 ${
          danger
            ? "bg-danger/10 text-danger ring-danger/30 hover:bg-danger/20"
            : "bg-cobalt text-linen ring-cobalt hover:bg-cobalt-2"
        }`}
      >
        {tt("confirm")}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="bg-sand/60 px-3 py-1.5 text-xs font-medium text-ink-soft ring-1 ring-inset ring-midnight/20 transition hover:text-midnight"
      >
        {tt("cancel")}
      </button>
    </div>
  );
}
