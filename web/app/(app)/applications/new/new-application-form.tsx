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
      // On success, the action redirects; this code path never runs.
    });
  }

  return (
    <form action={onSubmit} className="mt-6 space-y-5">
      <Row>
        <Field name="company" label="Company" required />
        <Field name="role" label="Role" required />
      </Row>
      <Field name="url" label="Job posting URL" type="url" placeholder="https://…" />
      <Field name="follow_up_at" label="Follow-up date" type="date" />
      <label className="block text-sm">
        <span className="font-medium text-zinc-700">Notes</span>
        <textarea
          name="notes"
          rows={4}
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
        />
      </label>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create application"}
      </button>
    </form>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, name, ...rest } = props;
  return (
    <label className="block text-sm">
      <span className="font-medium text-zinc-700">{label}</span>
      <input
        {...rest}
        name={name}
        className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
      />
    </label>
  );
}
