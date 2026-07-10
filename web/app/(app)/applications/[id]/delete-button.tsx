"use client";

import { useState, useTransition } from "react";
import { deleteApplication } from "@/app/lib/actions";

export function DeleteButton({ id }: { id: number }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (!window.confirm("Delete this application? This cannot be undone.")) return;
    setError(null);
    startTransition(async () => {
      // On success deleteApplication redirects (throws) and never resolves;
      // a resolved value is always a failure.
      const result = await deleteApplication(id);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="border border-red-300 bg-linen px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
