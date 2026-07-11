"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { deleteApplication } from "@/app/lib/actions";

// Inline confirm (not window.confirm) to match the styled confirm flow the
// transition buttons use — one destructive-action pattern across the app.
export function DeleteButton({ id }: { id: number }) {
  const t = useTranslations("delete");
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
      // basis-full below sm: the parent header row can't fit the back link
      // and this block side by side at 375px, and the prompt must never be
      // clipped — an unreadable confirmation defeats the confirm step.
      <div className="basis-full text-right sm:basis-auto">
        <p className="text-xs text-danger">{t("confirmPrompt")}</p>
        <div className="mt-1.5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="border border-danger/40 bg-danger/10 px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/20 disabled:opacity-50"
          >
            {pending ? t("deleting") : t("confirmDelete")}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="border border-dune bg-linen px-3 py-1.5 text-sm text-ink-soft hover:bg-sand disabled:opacity-50"
          >
            {t("cancel")}
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
        className="border border-danger/40 bg-linen px-3 py-1.5 text-sm text-danger hover:bg-danger/10"
      >
        {t("delete")}
      </button>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
