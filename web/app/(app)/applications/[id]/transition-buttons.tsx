"use client";

import { useState, useTransition } from "react";
import { transitionStatus } from "@/app/lib/actions";
import { statusBadgeClass, statusLabel } from "@/app/lib/format";
import type { Status } from "@/app/lib/types";

export function TransitionButtons({
  id,
  lockVersion,
  validNextStates,
}: {
  id: number;
  lockVersion: number;
  validNextStates: Status[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function go(to: Status) {
    setError(null);
    startTransition(async () => {
      const result = await transitionStatus(id, to, lockVersion);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div>
      <div className="mt-3 flex flex-wrap gap-2">
        {validNextStates.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => go(status)}
            disabled={pending}
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition hover:opacity-80 disabled:opacity-50 ${statusBadgeClass(status)}`}
          >
            → {statusLabel(status)}
          </button>
        ))}
      </div>
      {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
