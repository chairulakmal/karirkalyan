"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { transitionStatus } from "@/app/lib/actions";
import { statusBadgeClass } from "@/app/lib/format";
import {
  CONFIRM_REQUIRED,
  HARD_TERMINAL,
  REVIVAL_STATES,
} from "@/app/lib/transitions";
import type { Status } from "@/app/lib/types";

export function TransitionButtons({
  id,
  lockVersion,
  validNextStates,
  currentStatus,
}: {
  id: number;
  lockVersion: number;
  validNextStates: Status[];
  currentStatus: Status;
}) {
  const t = useTranslations("transitions");
  const ts = useTranslations("status");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Status | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [pending, startTransition] = useTransition();

  function go(to: Status, note?: string) {
    setError(null);
    setConfirming(null);
    setReversalReason("");
    startTransition(async () => {
      const result = await transitionStatus(id, to, lockVersion, note);
      if (result.ok) return;
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
    if (REVIVAL_STATES.has(currentStatus) && status === "applied") {
      setConfirming("applied");
      setReversalReason("");
    } else if (CONFIRM_REQUIRED.has(status)) {
      setConfirming(status);
    } else {
      go(status);
    }
  }

  function cancelConfirm() {
    setConfirming(null);
    setReversalReason("");
  }

  // Catalog entries under `transitions.reasons` are JSON arrays, so they are
  // read with `t.raw` rather than `t`; only the three revival states have any.
  const presets: string[] = REVIVAL_STATES.has(currentStatus)
    ? t.raw(`reasons.${currentStatus}`)
    : [];

  return (
    <div>
      <div className="mt-3 flex flex-wrap gap-2">
        {validNextStates.map((status) => {
          const isRevivalButton = REVIVAL_STATES.has(currentStatus) && status === "applied";

          if (confirming === status && isRevivalButton) {
            return (
              <div key={status} className="w-full space-y-3">
                <p className="text-xs font-medium text-ink-soft">{t("reopenPrompt")}</p>
                <div className="flex flex-wrap gap-2">
                  {presets.map((reason) => (
                    <button
                      key={reason}
                      type="button"
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
                <input
                  type="text"
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder={t("customReason")}
                  className="w-full border border-dune bg-linen px-3 py-1.5 font-mono text-xs text-midnight placeholder:text-ink-soft/50"
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

          if (confirming === status) {
            const isTerminal = HARD_TERMINAL.has(status);
            return (
              <div key={status} className="space-y-2">
                <p className="text-xs text-ink-soft">
                  {t.rich("confirmMark", {
                    label: ts(`label.${status}`),
                    description: ts(`description.${status}`),
                    b: (chunks) => <span className="font-medium text-midnight">{chunks}</span>,
                    dim: (chunks) => <span className="text-ink-soft/80">{chunks}</span>,
                  })}{" "}
                  {isTerminal ? (
                    <span className="text-danger/80">{t("permanentWarning")}</span>
                  ) : (
                    <span className="text-ink-soft/70">{t("reopenable")}</span>
                  )}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => go(status)}
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
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
    </div>
  );
}
