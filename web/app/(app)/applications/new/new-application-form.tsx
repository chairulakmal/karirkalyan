"use client";

import { useState, useTransition } from "react";
import { createApplication } from "@/app/lib/actions";

export function NewApplicationForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createApplication(formData);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <form action={onSubmit} className="mt-6 space-y-5 border border-dune bg-linen p-6">
      <Row>
        <Field name="company" label="Company" required />
        <Field name="role" label="Role" required />
      </Row>
      <Field name="url" label="Job posting URL" type="url" placeholder="https://…" />
      <Field name="follow_up_at" label="Follow-up date" type="date" />
      <label className="block text-sm">
        <span className="kk-label">Notes</span>
        <textarea
          name="notes"
          rows={4}
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

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, name, ...rest } = props;
  return (
    <label className="block text-sm">
      <span className="kk-label">{label}</span>
      <input
        {...rest}
        name={name}
        className="mt-1.5 block w-full border border-dune bg-linen px-3 py-2 text-sm text-midnight placeholder:text-ink-soft focus:border-cobalt focus:outline-none focus:ring-1 focus:ring-cobalt"
      />
    </label>
  );
}
