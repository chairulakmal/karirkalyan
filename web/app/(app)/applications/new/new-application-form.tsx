"use client";

import { useState, useTransition } from "react";
import { createApplication, prefillFromUrl } from "@/app/lib/actions";
import { Field } from "@/app/components/field";

export function NewApplicationForm() {
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
          Pre-fill from a job URL{" "}
          <span className="font-normal text-ink-soft">(optional · AI)</span>
        </span>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <input
            name="url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="block w-full border border-dune bg-linen px-3 py-2 text-sm text-midnight placeholder:text-ink-soft focus:border-cobalt focus:outline-none focus:ring-1 focus:ring-cobalt"
          />
          <button
            type="button"
            onClick={onPrefill}
            disabled={prefilling || !url.trim()}
            className="shrink-0 border border-cobalt bg-cobalt px-4 py-2 text-sm font-medium text-linen transition hover:bg-cobalt-2 disabled:opacity-50"
          >
            {prefilling ? "Reading…" : "Pre-fill with AI"}
          </button>
        </div>
        <p className="mt-2 text-xs text-ink-soft">
          Paste a Wantedly, LinkedIn, or company posting — Claude reads Japanese
          too. Review the fields before saving.
        </p>
        {prefillError ? (
          <p className="mt-2 text-sm text-red-700">{prefillError}</p>
        ) : null}
        {prefilled ? (
          <p className="mt-2 text-sm text-cobalt">
            Filled from the posting — review and edit before saving.
          </p>
        ) : null}
      </div>

      <Row>
        <Field
          name="company"
          label="Company"
          required
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
        <Field
          name="role"
          label="Role"
          required
          value={role}
          onChange={(e) => setRole(e.target.value)}
        />
      </Row>
      <label className="block text-sm">
        <span className="kk-label">Status</span>
        <select
          name="status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="mt-1.5 block w-full border border-dune bg-linen px-3 py-2 text-sm text-midnight focus:border-cobalt focus:outline-none focus:ring-1 focus:ring-cobalt"
        >
          <option value="wishlist">Wishlist — saved, might apply</option>
          <option value="draft">Draft — preparing my application</option>
          <option value="applied">Applied — already submitted</option>
        </select>
        <span className="mt-1 block text-xs text-ink-soft">
          You can advance the status later from the application page.
        </span>
      </label>
      {status === "applied" ? (
        <Field
          name="applied_at"
          label="Applied on"
          type="date"
          value={appliedAt}
          onChange={(e) => setAppliedAt(e.target.value)}
        />
      ) : null}
      <Field name="follow_up_at" label="Follow-up date" type="date" />
      <label className="block text-sm">
        <span className="kk-label">Notes</span>
        <textarea
          name="notes"
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1.5 block w-full border border-dune bg-linen px-3 py-2 text-sm text-midnight placeholder:text-ink-soft focus:border-cobalt focus:outline-none focus:ring-1 focus:ring-cobalt"
        />
      </label>
      <Row>
        <FileField name="resume" label="Resume" />
        <FileField name="cover_letter" label="Cover letter" />
      </Row>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="bg-cobalt px-4 py-2 text-sm font-medium text-linen transition hover:bg-cobalt-2 disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create application"}
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
  return (
    <label className="block text-sm">
      <span className="kk-label">
        {label} <span className="font-normal text-ink-soft">(optional, PDF)</span>
      </span>
      <input
        type="file"
        name={name}
        accept=".pdf,application/pdf"
        className="mt-1.5 block w-full border border-dune bg-linen px-3 py-2 text-sm text-midnight file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-cobalt"
      />
    </label>
  );
}
