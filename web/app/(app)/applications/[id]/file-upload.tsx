"use client";

import { useRef, useState, useTransition } from "react";
import { uploadFile } from "@/app/lib/actions";
import { fileTooLargeMessage, MAX_FILE_BYTES } from "@/app/lib/files";
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
    if (file.size > MAX_FILE_BYTES) {
      setError(fileTooLargeMessage(file.size));
      event.currentTarget.value = "";
      return;
    }
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
        <span className="text-sm font-medium text-midnight">
          {label} <span className="font-mono text-xs font-normal text-ink-soft">PDF · max 1 MB</span>
        </span>
        {uploadedAt ? (
          <a
            href={downloadHref}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-cobalt underline underline-offset-4 hover:text-cobalt-2"
          >
            View · uploaded {timeAgo(uploadedAt)}
          </a>
        ) : (
          <span className="font-mono text-xs text-ink-soft">Not uploaded</span>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={onChange}
        disabled={pending}
        className="mt-2 block w-full text-sm text-ink-soft file:mr-3 file:border-0 file:bg-cobalt file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-linen hover:file:bg-cobalt-2 disabled:opacity-50"
      />
      {pending ? <p className="mt-1 font-mono text-xs text-ink-soft">Uploading…</p> : null}
      {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
