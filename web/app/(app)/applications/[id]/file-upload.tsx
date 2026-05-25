"use client";

import { useRef, useState, useTransition } from "react";
import { uploadFile } from "@/app/lib/actions";
import { timeAgo } from "@/app/lib/format";

export function FileUpload({
  id,
  field,
  label,
  uploadedAt,
}: {
  id: number;
  field: "resume" | "cover_letter";
  label: string;
  uploadedAt: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    startTransition(async () => {
      const result = await uploadFile(id, field, formData);
      if (!result.ok) setError(result.error);
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  const downloadHref = `/api/applications/${id}/${field}`;

  return (
    <div className="mt-4 first:mt-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-zinc-700">{label}</span>
        {uploadedAt ? (
          <a
            href={downloadHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-zinc-500 underline underline-offset-4 hover:text-zinc-900"
          >
            View · uploaded {timeAgo(uploadedAt)}
          </a>
        ) : (
          <span className="text-xs text-zinc-400">Not uploaded</span>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={onChange}
        disabled={pending}
        className="mt-2 block w-full text-sm text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-700 hover:file:bg-zinc-200 disabled:opacity-50"
      />
      {pending ? <p className="mt-1 text-xs text-zinc-500">Uploading…</p> : null}
      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
