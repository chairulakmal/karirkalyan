"use client";

import { useState, useTransition } from "react";
import { deleteApplication } from "@/app/lib/actions";

// Inline confirm (not window.confirm) to match the styled confirm flow the
// transition buttons use — one destructive-action pattern across the app.
export function DeleteButton({ id }: { id: number }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      // On success deleteApplication redirects (throws) and never resolves;
      // a resolved value is always a failure.
      const result = await deleteApplication(id);
      if (!result.ok) {
        setError(result.error);
        setConfirming(false);
      }
    });
  }

  if (confirming) {
    return (
      <div className="text-right">
        <p className="text-xs text-red-700">Delete permanently? This cannot be undone.</p>
        <div className="mt-1.5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            {pending ? "Deleting…" : "Confirm delete"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="border border-dune bg-linen px-3 py-1.5 text-sm text-ink-soft hover:bg-sand disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="border border-red-300 bg-linen px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
      >
        Delete
      </button>
      {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
