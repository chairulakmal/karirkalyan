"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { generateTalkingPoints } from "@/app/lib/actions";

// Cover-letter talking points, generated on demand and not stored: the user
// draws the letter from these bullets. The button is always offered; if the
// resume or posting is missing, the server says so rather than the button
// hiding and leaving the user to guess why (SPEC.md § TalkingPointsService).
export function TalkingPoints({ id }: { id: number }) {
  const t = useTranslations("talkingPoints");
  const [points, setPoints] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onGenerate() {
    setError(null);
    startTransition(async () => {
      const result = await generateTalkingPoints(id);
      if (result.ok) setPoints(result.points);
      else setError(result.error);
    });
  }

  return (
    <div className="border border-dune bg-linen p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="kk-label">{t("title")}</p>
        <button
          type="button"
          onClick={onGenerate}
          disabled={pending}
          className="shrink-0 text-xs font-medium text-cobalt underline underline-offset-4 transition hover:text-cobalt-2 disabled:opacity-50"
        >
          {pending ? t("generating") : points ? t("regenerate") : t("generate")}
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-soft">{t("hint")}</p>

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      {points ? (
        points.length > 0 ? (
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-midnight">
            {points.map((point, i) => (
              <li key={i}>{point}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-soft">{t("none")}</p>
        )
      ) : null}
    </div>
  );
}
