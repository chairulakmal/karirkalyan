"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createApplication, prefillFromUrl } from "@/app/lib/actions";
import { fileSizeMb, MAX_FILE_BYTES } from "@/app/lib/files";
import { Field } from "@/app/components/field";

export function NewApplicationForm() {
  const t = useTranslations("newApplication");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Controlled so the AI pre-fill can populate them. The URL field doubles as
  // the pre-fill source.
  const [url, setUrl] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [notes, setNotes] = useState("");

  // Creation sets the initial state; the FSM governs every change after that.
  const [status, setStatus] = useState("draft");
  const [appliedAt, setAppliedAt] = useState(todayISO());

  const [prefilling, startPrefill] = useTransition();
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  function onPrefill() {
    setPrefillError(null);
    setPrefilled(false);
    startPrefill(async () => {
      const result = await prefillFromUrl(url);
      if (!result.ok) {
        setPrefillError(result.error);
        return;
      }
      if (result.company) setCompany(result.company);
      if (result.role) setRole(result.role);
      if (result.notes) setNotes(result.notes);
      if (result.url) setUrl(result.url);
      setPrefilled(true);
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
        {prefillError ? (
          <p className="mt-2 text-sm text-danger">{prefillError}</p>
        ) : null}
        {prefilled ? <p className="mt-2 text-sm text-cobalt">{t("prefillDone")}</p> : null}
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
      <label className="block text-sm">
        <span className="kk-label">{t("status")}</span>
        <select
          name="status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="mt-1.5 block w-full border border-dune bg-linen px-3 py-2 text-sm text-midnight"
        >
          <option value="wishlist">{t("statusWishlist")}</option>
          <option value="draft">{t("statusDraft")}</option>
          <option value="applied">{t("statusApplied")}</option>
        </select>
        <span className="mt-1 block text-xs text-ink-soft">{t("statusHint")}</span>
      </label>
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
