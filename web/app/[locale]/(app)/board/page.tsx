import { getTranslations } from "next-intl/server";
import { apiFetch } from "@/app/lib/api";
import type { Application, Paginated, TransitionTable } from "@/app/lib/types";
import { Board } from "./board";

// A board is a view of *everything*, so the cursor-paginated index is followed
// to exhaustion — but bounded, or one pathological account hangs the page.
// Past the cap the board renders what it fetched plus a truncation notice.
// See SPEC.md § Board view.
const PAGE_LIMIT = 100;
const MAX_PAGES = 10;

type FetchAll =
  | { ok: true; applications: Application[]; truncated: boolean }
  | { ok: false; error: string };

async function fetchAllApplications(): Promise<FetchAll> {
  const applications: Application[] = [];
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({ limit: String(PAGE_LIMIT) });
    if (after) qs.set("after", after);
    const res = await apiFetch<Paginated<Application>>(`/applications?${qs}`);
    if (!res.ok) return { ok: false, error: res.error };

    applications.push(...res.data.data);
    const { meta } = res.data;
    if (!meta.has_more || !meta.next_cursor) {
      return { ok: true, applications, truncated: false };
    }
    after = meta.next_cursor;
  }

  return { ok: true, applications, truncated: true };
}

export default async function BoardPage() {
  const [t, appsRes, tableRes] = await Promise.all([
    getTranslations("board"),
    fetchAllApplications(),
    apiFetch<TransitionTable>("/transitions"),
  ]);

  if (!appsRes.ok || !tableRes.ok) {
    const message = !appsRes.ok ? appsRes.error : !tableRes.ok ? tableRes.error : "";
    return (
      <div className="border border-danger/40 bg-danger/10 p-5 text-sm text-danger">
        {t("failedToLoad", { message })}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="border-b border-dune pb-6">
        <p className="kk-label">{t("eyebrow")}</p>
        <h1 className="mt-1 text-3xl">{t("title")}</h1>
        <p className="mt-1 font-mono text-xs text-ink-soft">
          {t("tracked", { count: appsRes.applications.length })}
        </p>
      </header>

      {appsRes.truncated && (
        <p className="border border-saffron bg-saffron-2/30 p-4 text-sm text-midnight">
          {t("truncated", { count: appsRes.applications.length })}
        </p>
      )}

      <Board applications={appsRes.applications} table={tableRes.data} />
    </div>
  );
}
