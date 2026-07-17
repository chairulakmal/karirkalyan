import { getTranslations } from "next-intl/server";
import { apiFetch } from "@/app/lib/api";
import type { TransitionTable } from "@/app/lib/types";
import { NewApplicationForm } from "./new-application-form";

export default async function NewApplicationPage() {
  const [t, tableRes] = await Promise.all([
    getTranslations("newApplication"),
    apiFetch<TransitionTable>("/transitions"),
  ]);

  /* Which states an application may be *created* in is an FSM fact, so it is
     fetched rather than copied (SPEC.md § The transition table). Degrades to
     `[]` when the table fails or predates the field; the form reads that as
     *unknown* and drops the picker, letting the API pick the initial state. */
  const entryStates = tableRes.ok ? (tableRes.data.entry_states ?? []) : [];

  return (
    <div className="mx-auto max-w-2xl">
      <p className="kk-label">{t("eyebrow")}</p>
      <h1 className="mt-1 text-3xl">{t("title")}</h1>
      <p className="mt-1 text-sm text-ink-soft">
        {t.rich("lede", {
          code: (chunks) => <code className="font-mono">{chunks}</code>,
        })}
      </p>
      <NewApplicationForm entryStates={entryStates} />
    </div>
  );
}
