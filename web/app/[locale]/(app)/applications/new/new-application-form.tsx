"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createApplication, prefillFromText, prefillFromUrl } from "@/app/lib/actions";
import type { PrefillResult } from "@/app/lib/actions";
import { fileSizeMb, MAX_FILE_BYTES } from "@/app/lib/files";
import type { SharedCapture } from "@/app/lib/share";
import { Field } from "@/app/components/field";
import type { Status } from "@/app/lib/types";

/* The two failure codes a paste actually cures, and the reason the error
   taxonomy was typed in the first place. `prefill_blocked` is a site refusing an
   automated reader; `prefill_failed` is us reaching the page and finding no
   posting in it — a login wall, an SPA shell, a challenge interstitial. Both
   describe a page the user can see and we cannot, which is precisely what a paste
   fixes.

   The two absent codes are the point. `prefill_unreachable` may well answer on a
   second try, so it keeps the Pre-fill button as its retry rather than demanding
   the user hand-carry a page that was never refused; `invalid_url` means the URL
   is wrong, and pasting a posting would not make it right. Offering the box on
   all four would be noise on half of them. */
type PrefillCode =
  | "invalid_url"
  | "prefill_blocked"
  | "prefill_failed"
  | "prefill_unreachable"
  | "prefill_paste_too_long"
  | "prefill_unavailable";

/* Typed on the way in so a typo cannot compile, widened on the way out so `.has`
   still takes the `string | undefined` an ActionFailure carries. */
const PASTE_CURES: ReadonlySet<string> = new Set<PrefillCode>([
  "prefill_blocked",
  "prefill_failed",
]);

export function NewApplicationForm({
  entryStates,
  share = null,
}: {
  entryStates: Status[];
  share?: SharedCapture | null;
}) {
  const t = useTranslations("newApplication");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // What a share-sheet navigation carried, already reduced server-side to the
  // one field it belongs in (SPEC.md § Installable app § Share target).
  const sharedUrl = share?.kind === "url" ? share.url : null;
  const sharedText = share?.kind === "text" ? share.text : null;

  // Controlled so the AI pre-fill can populate them. The URL field doubles as
  // the pre-fill source.
  const [url, setUrl] = useState(sharedUrl ?? "");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [notes, setNotes] = useState("");

  /* Creation sets the initial state; the FSM governs every change after that.
     Which states are offered comes from the fetched `entry_states` — the FSM
     owns that set. Only the *pre-selection* is decided here: "draft" is what
     the API falls back to when no status is sent, so preferring it keeps the
     form agreeing with the server. That is a default rather than a set, and it
     cannot go stale into a wrong option — if "draft" ever leaves the entry set,
     `includes` fails and the first offered state is selected instead. */
  const [status, setStatus] = useState<Status | "">(
    entryStates.includes("draft") ? "draft" : (entryStates[0] ?? ""),
  );
  const [appliedAt, setAppliedAt] = useState(todayISO());

  const [prefilling, startPrefill] = useTransition();
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  // The escape hatch stays shut until a failure the paste can actually cure. It
  // never closes again on its own: once the user has been told no, hiding their
  // way out from under them is worse than a little clutter. The one other way
  // in: a text-only share *is* a posting with no URL to try, so it arrives with
  // the box open and seeded — and nothing run, because the paste box's design
  // is that the user vouches for what is in it before it is sent.
  const [pasteOpen, setPasteOpen] = useState(sharedText !== null);
  const [posting, setPosting] = useState(sharedText ?? "");

  /* Informational, and deliberately not a limit. The cap is on the *stripped*
     text, which only the server can measure — counting the raw paste here would
     block a view-source dump that strips to a third of its length, and MAX_FILE_BYTES'
     spare-the-round-trip logic does not transfer to a number the client cannot
     compute. So the server refuses an over-cap paste (`prefill_paste_too_long`)
     with the real figure, and this only tells the user how much they pasted.

     Spread, not `.length`: that counts UTF-16 code units, so an emoji scores 2 and
     a Japanese posting's count would be a number matching nothing the user or the
     server can see. Ruby counts codepoints, and this is a Japanese-language app. */
  const pastedChars = [...posting].length;

  function applyPrefill(result: Extract<PrefillResult, { ok: true }>) {
    if (result.company) setCompany(result.company);
    if (result.role) setRole(result.role);
    if (result.notes) setNotes(result.notes);
    if (result.url) setUrl(result.url);
    setPrefilled(true);
  }

  function runUrlPrefill(source: string) {
    setPrefillError(null);
    setPrefilled(false);
    startPrefill(async () => {
      const result = await prefillFromUrl(source);
      if (!result.ok) {
        setPrefillError(result.error);
        // Branching on `code`, never on the sentence — the codes exist so nobody
        // has to parse prose, and the prose is translated besides.
        if (result.code && PASTE_CURES.has(result.code)) setPasteOpen(true);
        return;
      }
      applyPrefill(result);
    });
  }

  function onPrefill() {
    runUrlPrefill(url);
  }

  /* A shared URL is an instruction, not a draft: the share sheet's contract is
     "share a posting → land in a prefilled form", so arrival fires the same
     pre-fill the button does (SPEC.md § Installable app § Share target).
     Ref-guarded so Strict Mode's doubled effect cannot spend two Claude calls
     on one share. */
  const autoPrefilled = useRef(false);
  useEffect(() => {
    if (!sharedUrl || autoPrefilled.current) return;
    autoPrefilled.current = true;
    runUrlPrefill(sharedUrl);
    // runUrlPrefill reads only stable setters, but is re-created per render —
    // depending on its identity would re-fire a network call every render,
    // which is the bug, not the fix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedUrl]);

  function onPrefillFromPaste() {
    setPrefillError(null);
    setPrefilled(false);
    startPrefill(async () => {
      const result = await prefillFromText(posting, url);
      if (!result.ok) {
        setPrefillError(result.error);
        return;
      }
      applyPrefill(result);
    });
  }

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createApplication(formData);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <form action={onSubmit} className="mt-6 space-y-5 border border-dune bg-linen p-6">
      <div className="border border-cobalt/30 bg-cobalt/5 p-4">
        <span className="kk-label">
          {t("prefillLabel")}{" "}
          <span className="font-normal text-ink-soft">{t("prefillOptional")}</span>
        </span>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <input
            name="url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="block w-full border border-dune bg-linen px-3 py-2 text-sm text-midnight placeholder:text-ink-soft"
          />
          <button
            type="button"
            onClick={onPrefill}
            disabled={prefilling || !url.trim()}
            className="shrink-0 border border-cobalt bg-cobalt px-4 py-2 text-sm font-medium text-linen transition hover:bg-cobalt-2 disabled:opacity-50"
          >
            {prefilling ? t("prefillReading") : t("prefillButton")}
          </button>
        </div>
        <p className="mt-2 text-xs text-ink-soft">{t("prefillHint")}</p>
        {/* role="alert", like board.tsx's error line: this is the only thing that
            tells the user a pre-fill failed, and on the paste path it carries the
            server's refusal — the whole reason the cap is measured there and not
            here. A message nobody hears is not a refusal. */}
        {prefillError ? (
          <p role="alert" className="mt-2 text-sm text-danger">{prefillError}</p>
        ) : null}
        {prefilled ? (
          <p role="status" className="mt-2 text-sm text-cobalt">{t("prefillDone")}</p>
        ) : null}

        {pasteOpen ? (
          <div className="mt-4 border-t border-cobalt/30 pt-4">
            {/* A real <label>, not a styled <span>: it is what gives the textarea an
                accessible name, and what lets a test reach it by getByLabel — the
                same reasoning field.tsx's wrapper already carries. Explicit
                htmlFor rather than field.tsx's wrapping, because the hint sits
                between the label and the box: an accessible name is the label's
                whole text subtree, so wrapping all three would fold the hint into
                the name and announce it twice — once in the name, once through
                aria-describedby, which is what actually associates it. */}
            <label htmlFor="paste-text" className="block">
              <span className="kk-label">{t("pasteLabel")}</span>
            </label>
            <p id="paste-hint" className="mt-1 text-xs font-normal text-ink-soft">
              {t("pasteHint")}
            </p>
            {/* No maxLength, deliberately: it would truncate the paste on arrival
                and say nothing — the exact silent cut this box exists to avoid.
                Nothing is blocked here either; the server owns the cap, because
                it is the only side that can measure the stripped length. */}
            <textarea
              id="paste-text"
              value={posting}
              onChange={(e) => setPosting(e.target.value)}
              rows={8}
              placeholder={t("pastePlaceholder")}
              aria-describedby="paste-hint paste-count"
              className="mt-2 block w-full border border-dune bg-linen px-3 py-2 text-sm text-midnight placeholder:text-ink-soft"
            />
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              {/* Not a live region, deliberately. It is already the textarea's
                  description, and it blocks nothing — the server owns the cap — so
                  there is no decision here to announce, only a number that would
                  interrupt on every keystroke. The refusal is what has to be heard,
                  and that is the role="alert" above. */}
              <span id="paste-count" className="text-xs text-ink-soft">
                {t("pasteCounter", { count: pastedChars })}
              </span>
              <button
                type="button"
                onClick={onPrefillFromPaste}
                disabled={prefilling || !posting.trim()}
                className="shrink-0 border border-cobalt bg-cobalt px-4 py-2 text-sm font-medium text-linen transition hover:bg-cobalt-2 disabled:opacity-50"
              >
                {prefilling ? t("prefillReading") : t("pasteButton")}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <Row>
        <Field
          name="company"
          label={t("company")}
          required
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
        <Field
          name="role"
          label={t("role")}
          required
          value={role}
          onChange={(e) => setRole(e.target.value)}
        />
      </Row>
      {/* No entry set means the table failed or predates the field — not that
          there are no entry states, which the FSM never allows. Dropping the
          picker sends no `status`, so the API applies its own default; offering
          a guessed set would risk a 422 on a state it no longer accepts. */}
      {entryStates.length === 0 ? null : (
        <label className="block text-sm">
          <span className="kk-label">{t("status")}</span>
          <select
            name="status"
            value={status}
            // Every option's value is a member of `entryStates`, so the cast
            // re-states what the render below already guarantees.
            onChange={(e) => setStatus(e.target.value as Status)}
            className="mt-1.5 block w-full border border-dune bg-linen px-3 py-2 text-sm text-midnight"
          >
            {entryStates.map((s) => (
              <option key={s} value={s}>
                {t(`entryStatus.${s}`)}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-ink-soft">{t("statusHint")}</span>
        </label>
      )}
      {status === "applied" ? (
        <Field
          name="applied_at"
          label={t("appliedOn")}
          type="date"
          value={appliedAt}
          onChange={(e) => setAppliedAt(e.target.value)}
        />
      ) : null}
      <Field name="follow_up_at" label={t("followUpDate")} type="date" />
      <label className="block text-sm">
        <span className="kk-label">{t("notes")}</span>
        <textarea
          name="notes"
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1.5 block w-full border border-dune bg-linen px-3 py-2 text-sm text-midnight placeholder:text-ink-soft"
        />
      </label>
      <Row>
        <FileField name="resume" label={t("resume")} />
        <FileField name="cover_letter" label={t("coverLetter")} />
      </Row>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="bg-cobalt px-4 py-2 text-sm font-medium text-linen transition hover:bg-cobalt-2 disabled:opacity-50"
      >
        {pending ? t("creating") : t("submit")}
      </button>
    </form>
  );
}

// Local date (not UTC) so "today" matches the user's calendar near midnight.
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

function FileField({ name, label }: { name: string; label: string }) {
  const t = useTranslations("files");
  const [error, setError] = useState<string | null>(null);

  // Rejecting oversize files here (and clearing the input so an invalid file
  // can't ride along on submit) beats a server round-trip that would fail.
  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (file && file.size > MAX_FILE_BYTES) {
      setError(t("tooLarge", { size: fileSizeMb(file.size) }));
      event.currentTarget.value = "";
    } else {
      setError(null);
    }
  }

  return (
    <label className="block text-sm">
      <span className="kk-label">
        {label} <span className="font-normal text-ink-soft">{t("optional")}</span>
      </span>
      <input
        type="file"
        name={name}
        accept=".pdf,application/pdf"
        onChange={onChange}
        className="mt-1.5 block w-full border border-dune bg-linen px-3 py-2 text-sm text-midnight file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-cobalt"
      />
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </label>
  );
}
