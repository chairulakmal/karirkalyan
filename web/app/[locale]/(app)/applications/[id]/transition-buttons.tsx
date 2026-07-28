"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { transitionStatus } from "@/app/lib/actions";
import { statusBadgeClass } from "@/app/lib/format";
import { useToast } from "@/app/components/toast";
import { CONFIRM_REQUIRED, NOTE_MAX_LENGTH, STAGE_NOTE_STATES } from "@/app/lib/transitions";
import type { Status } from "@/app/lib/types";

/**
 * `terminalStates` is the fetched table's, not a copy of the FSM's (SPEC.md
 * § The transition table). Empty means the table didn't arrive: the FSM always
 * has terminal states, so empty is never a real answer, and the confirm then
 * says neither "permanent" nor "reopenable" rather than guessing.
 */
export function TransitionButtons({
  id,
  lockVersion,
  validNextStates,
  currentStatus,
  terminalStates,
  revivable,
}: {
  id: number;
  lockVersion: number;
  validNextStates: Status[];
  currentStatus: Status;
  terminalStates: Status[];
  // Whether the current status re-opens to `applied` (derived from the fetched
  // table by the page via canRevive, not a hardcoded set). Gates the reason
  // prompt; false when the table did not arrive, so the prompt is simply absent.
  revivable: boolean;
}) {
  const t = useTranslations("transitions");
  const ts = useTranslations("status");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Status | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [stageNote, setStageNote] = useState("");
  const [pending, startTransition] = useTransition();

  // Focus management for the three confirm panels below. Same job as
  // app/lib/use-confirm-panel.ts, done by hand for the same reason
  // passkeys-manager does: the panel replaces one button inside a .map(), so
  // focus has to return to the trigger for *that* status, looked up by key.
  // Without this, opening a confirm dropped focus to <body> and Confirm was a
  // full tab-from-top away; cancelling stranded the user a second time.
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef(new Map<Status, HTMLButtonElement | null>());
  const previousConfirming = useRef<Status | null>(null);

  useEffect(() => {
    const previous = previousConfirming.current;
    if (confirming === previous) return;
    previousConfirming.current = confirming;

    if (confirming !== null) {
      // The first control is the preset chip row or the note field, which is
      // where the user's next decision is, not the Confirm button.
      panelRef.current
        ?.querySelector<HTMLElement>('button:not([disabled]), textarea, input[type="text"]')
        ?.focus();
    } else if (previous !== null) {
      triggerRefs.current.get(previous)?.focus();
    }
  }, [confirming]);

  function go(to: Status, note?: string) {
    setError(null);
    setConfirming(null);
    setReversalReason("");
    setStageNote("");
    startTransition(async () => {
      const result = await transitionStatus(id, to, lockVersion, note);
      if (result.ok) {
        toast.success(t("moved", { label: ts(`label.${to}`) }));
        return;
      }
      if (result.status === 409) {
        // Stale optimistic lock: refresh so a fresh lockVersion prop flows in
        // and the retry can succeed without a manual reload.
        setError(tErrors("refreshingStale"));
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function handleClick(status: Status) {
    if (revivable && status === "applied") {
      setConfirming("applied");
      setReversalReason("");
    } else if (STAGE_NOTE_STATES.has(status)) {
      // An interview stage: offer an optional note before advancing.
      setConfirming(status);
      setStageNote("");
    } else if (CONFIRM_REQUIRED.has(status)) {
      // A closing move: confirm, and offer an optional note (rejection feedback,
      // offer terms) attached to this exact transition, the same textarea an
      // interview stage gets. Skipping it is a plain confirm.
      setConfirming(status);
      setStageNote("");
    } else {
      go(status);
    }
  }

  function cancelConfirm() {
    setConfirming(null);
    setReversalReason("");
    setStageNote("");
  }

  // Catalog entries under `transitions.reasons` are JSON arrays, so they are
  // read with `t.raw` rather than `t`; only the three revival states have any.
  const presets: string[] = revivable
    ? t.raw(`reasons.${currentStatus}`)
    : [];

  return (
    <div>
      <div className="mt-3 flex flex-wrap gap-2">
        {validNextStates.map((status) => {
          const isRevivalButton = revivable && status === "applied";

          if (confirming === status && isRevivalButton) {
            return (
              <div key={status} ref={panelRef} className="w-full space-y-3">
                <p role="alert" className="text-xs font-medium text-ink-soft">
                  {t("reopenPrompt")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {presets.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      // aria-pressed: selection was signalled by fill colour
                      // alone, which is nothing to a screen reader (WCAG 1.4.1
                      // for the visual, 4.1.2 for the state).
                      aria-pressed={reversalReason === reason}
                      onClick={() => setReversalReason(reason)}
                      className={`inline-flex min-h-10 items-center px-3 py-1 text-xs ring-1 ring-inset ring-midnight/20 transition ${
                        reversalReason === reason
                          ? "bg-cobalt text-linen"
                          : "bg-sand/40 text-ink-soft hover:text-midnight"
                      }`}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
                {/* The instruction above is an unassociated <p>, and a
                    placeholder disappears the moment the user types, so without
                    aria-label this field announced as an unnamed text box
                    (WCAG 3.3.2). Its sibling at the closing panel below already
                    did this correctly. */}
                <input
                  type="text"
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder={t("customReason")}
                  aria-label={t("reopenPrompt")}
                  className="w-full border border-rule-strong bg-linen px-3 py-1.5 font-mono text-xs text-midnight placeholder:text-ink-soft"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => go("applied", reversalReason.trim())}
                    disabled={pending || reversalReason.trim().length === 0}
                    className="inline-flex min-h-10 items-center px-4 py-1.5 text-xs font-medium bg-cobalt text-linen transition hover:bg-cobalt-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t("confirm")}
                  </button>
                  <button
                    type="button"
                    onClick={cancelConfirm}
                    disabled={pending}
                    className="inline-flex min-h-10 items-center px-4 py-1.5 text-xs font-medium ring-1 ring-inset ring-midnight/20 bg-sand/60 text-ink-soft transition hover:text-midnight disabled:opacity-50"
                  >
                    {t("cancel")}
                  </button>
                </div>
              </div>
            );
          }

          if (confirming === status && STAGE_NOTE_STATES.has(status)) {
            return (
              <div key={status} ref={panelRef} className="w-full space-y-3">
                <p role="alert" className="text-xs font-medium text-ink-soft">
                  {t("stageNotePrompt", { label: ts(`label.${status}`) })}
                </p>
                {/* Optional: Advance works with an empty note. "who you met,
                    what they asked" attaches to this exact transition. */}
                <textarea
                  value={stageNote}
                  onChange={(e) => setStageNote(e.target.value)}
                  placeholder={t("stageNotePlaceholder")}
                  aria-label={t("stageNotePrompt", { label: ts(`label.${status}`) })}
                  maxLength={NOTE_MAX_LENGTH}
                  rows={3}
                  className="w-full border border-rule-strong bg-linen px-3 py-1.5 text-xs text-midnight placeholder:text-ink-soft"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => go(status, stageNote.trim() || undefined)}
                    disabled={pending}
                    className="inline-flex min-h-10 items-center px-4 py-1.5 text-xs font-medium bg-cobalt text-linen transition hover:bg-cobalt-2 disabled:opacity-50"
                  >
                    {t("advance")}
                  </button>
                  <button
                    type="button"
                    onClick={cancelConfirm}
                    disabled={pending}
                    className="inline-flex min-h-10 items-center px-4 py-1.5 text-xs font-medium ring-1 ring-inset ring-midnight/20 bg-sand/60 text-ink-soft transition hover:text-midnight disabled:opacity-50"
                  >
                    {t("cancel")}
                  </button>
                </div>
              </div>
            );
          }

          if (confirming === status) {
            const permanence = terminalStates.length === 0 ? null : terminalStates.includes(status);
            return (
              <div key={status} ref={panelRef} className="w-full space-y-3">
                <p role="alert" className="text-xs text-ink-soft">
                  {t.rich("confirmMark", {
                    label: ts(`label.${status}`),
                    description: ts(`description.${status}`),
                    b: (chunks) => <span className="font-medium text-midnight">{chunks}</span>,
                    dim: (chunks) => <span className="text-ink-soft">{chunks}</span>,
                  })}{" "}
                  {permanence === true ? (
                    <span className="text-danger">{t("permanentWarning")}</span>
                  ) : permanence === false ? (
                    <span className="text-ink-soft">{t("reopenable")}</span>
                  ) : null}
                </p>
                {/* Optional note on the way out: a closing move often carries a
                    reason worth keeping (rejection feedback, offer terms),
                    recorded as this transition's note the same way a stage note
                    is. Confirm works with it empty. */}
                <textarea
                  value={stageNote}
                  onChange={(e) => setStageNote(e.target.value)}
                  placeholder={t("closeNotePlaceholder")}
                  aria-label={t("closeNotePrompt")}
                  maxLength={NOTE_MAX_LENGTH}
                  rows={2}
                  className="w-full border border-rule-strong bg-linen px-3 py-1.5 text-xs text-midnight placeholder:text-ink-soft"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => go(status, stageNote.trim() || undefined)}
                    disabled={pending}
                    className="inline-flex min-h-10 items-center px-3 py-1 text-xs font-medium ring-1 ring-inset bg-danger/10 text-danger ring-danger/30 transition hover:bg-danger/20 disabled:opacity-50"
                  >
                    {t("confirm")}
                  </button>
                  <button
                    type="button"
                    onClick={cancelConfirm}
                    disabled={pending}
                    className="inline-flex min-h-10 items-center px-3 py-1 text-xs font-medium ring-1 ring-inset ring-midnight/20 bg-sand/60 text-ink-soft transition hover:text-midnight disabled:opacity-50"
                  >
                    {t("cancel")}
                  </button>
                </div>
              </div>
            );
          }

          return (
            <button
              key={status}
              ref={(node) => {
                triggerRefs.current.set(status, node);
              }}
              type="button"
              onClick={() => handleClick(status)}
              disabled={pending}
              title={ts(`description.${status}`)}
              className={`inline-flex min-h-10 items-center px-3 py-1 text-xs font-medium ring-1 ring-inset transition hover:opacity-80 disabled:opacity-50 ${statusBadgeClass(status)}`}
            >
              {t("goTo", { label: ts(`label.${status}`) })}
            </button>
          );
        })}
      </div>
      {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
    </div>
  );
}
