import { getTranslations } from "next-intl/server";
import { apiFetch } from "@/app/lib/api";
import { capturedShare } from "@/app/lib/share";
import type { TransitionTable } from "@/app/lib/types";
import { NewApplicationForm } from "./new-application-form";

export default async function NewApplicationPage({
  searchParams,
}: {
  /* The share_target params (SPEC.md § Installable app § Share target). The
     share sheet is one caller of a plain deep link — the page reads these on
     any navigation, shared or hand-built. */
  searchParams: Promise<{
    url?: string | string[];
    text?: string | string[];
    title?: string | string[];
  }>;
}) {
  const [params, t, tableRes] = await Promise.all([
    searchParams,
    getTranslations("newApplication"),
    apiFetch<TransitionTable>("/transitions"),
  ]);

  const share = capturedShare(params);

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
      <NewApplicationForm entryStates={entryStates} share={share} />
    </div>
  );
}
