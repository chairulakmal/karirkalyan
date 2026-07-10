"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { transitionStatus } from "@/app/lib/actions";
import { statusBadgeClass, statusLabel } from "@/app/lib/format";
import type { Status } from "@/app/lib/types";

const CONFIRM_REQUIRED = new Set<Status>(["rejected", "accepted", "declined", "withdrawn", "archived"]);

const REVIVAL_STATES = new Set<Status>(["ghosted", "rejected", "withdrawn"]);

const HARD_TERMINAL = new Set<Status>(["accepted", "declined", "archived"]);

const REVIVAL_REASONS: Partial<Record<Status, string[]>> = {
  ghosted:  ["Company reached back out", "Responded after follow-up", "Recorded in error"],
  rejected: ["Recruiter rescinded rejection", "Position reopened", "Recorded in error"],
  withdrawn: ["Re-engaged with company", "Withdrew by mistake", "Recorded in error"],
};

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
        setError("This application was changed elsewhere — refreshing to the latest version…");
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

  const presets = REVIVAL_REASONS[currentStatus] ?? [];

  return (
    <div>
      <div className="mt-3 flex flex-wrap gap-2">
        {validNextStates.map((status) => {
          const isRevivalButton = REVIVAL_STATES.has(currentStatus) && status === "applied";

          if (confirming === status && isRevivalButton) {
            return (
              <div key={status} className="w-full space-y-3">
                <p className="text-xs font-medium text-ink-soft">
                  Why re-opening this application?
                </p>
                <div className="flex flex-wrap gap-2">
                  {presets.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => setReversalReason(reason)}
                      className={`px-3 py-1 text-xs ring-1 ring-inset ring-midnight/20 transition ${
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
                  placeholder="Or type a custom reason…"
                  className="w-full border border-dune bg-linen px-3 py-1.5 font-mono text-xs text-midnight placeholder:text-ink-soft/50 focus:border-cobalt focus:outline-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => go("applied", reversalReason.trim())}
                    disabled={pending || reversalReason.trim().length === 0}
                    className="px-4 py-1.5 text-xs font-medium bg-cobalt text-linen transition hover:bg-cobalt-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={cancelConfirm}
                    disabled={pending}
                    className="px-4 py-1.5 text-xs font-medium ring-1 ring-inset ring-midnight/20 bg-sand/60 text-ink-soft transition hover:text-midnight disabled:opacity-50"
                  >
                    Cancel
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
                  Mark as <span className="font-medium text-midnight">{statusLabel(status)}</span>?{" "}
                  {isTerminal ? (
                    <span className="text-red-600/80">No further transitions — permanent.</span>
                  ) : (
                    <span className="text-ink-soft/70">Can be re-opened to Applied later.</span>
                  )}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => go(status)}
                    disabled={pending}
                    className="inline-flex items-center px-3 py-1 text-xs font-medium ring-1 ring-inset bg-red-50 text-red-700 ring-red-200 transition hover:bg-red-100 disabled:opacity-50"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={cancelConfirm}
                    disabled={pending}
                    className="inline-flex items-center px-3 py-1 text-xs font-medium ring-1 ring-inset ring-midnight/20 bg-sand/60 text-ink-soft transition hover:text-midnight disabled:opacity-50"
                  >
                    Cancel
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
              className={`inline-flex min-h-10 items-center px-3 py-1 text-xs font-medium ring-1 ring-inset transition hover:opacity-80 disabled:opacity-50 ${statusBadgeClass(status)}`}
            >
              → {statusLabel(status)}
            </button>
          );
        })}
      </div>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
