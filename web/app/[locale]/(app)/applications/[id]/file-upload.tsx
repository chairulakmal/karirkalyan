"use client";

import { useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { uploadFile } from "@/app/lib/actions";
import { fileSizeMb, MAX_FILE_BYTES } from "@/app/lib/files";
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
  const t = useTranslations("files");
  const locale = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Two of these render on the detail page, so the ids have to be per-instance
  // or the second label would point at the first input.
  const inputId = `upload-${field}`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    // The control is no longer `disabled` mid-upload (it drops focus), so the
    // handler is what stops a second file being picked while one is in flight.
    if (pending) {
      event.currentTarget.value = "";
      return;
    }
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError(t("tooLarge", { size: fileSizeMb(file.size) }));
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
        {/* A real <label htmlFor>, not a bare <span>: without it the two file
            inputs on this page have no accessible name at all, so a screen
            reader announces two identical unlabelled upload buttons and there
            is no way to tell resume from cover letter (WCAG 4.1.2 / 3.3.2).
            The size hint is associated separately via aria-describedby rather
            than wrapped, so it describes the control instead of becoming part
            of its name. */}
        <label htmlFor={inputId} className="text-sm font-medium text-midnight">
          {label}{" "}
          <span id={hintId} className="font-mono text-xs font-normal text-ink-soft">
            {t("hint")}
          </span>
        </label>
        {uploadedAt ? (
          <a
            href={downloadHref}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-cobalt underline underline-offset-4 hover:text-cobalt-2"
          >
            {t("view", { ago: timeAgo(uploadedAt, locale) })}
          </a>
        ) : (
          <span className="font-mono text-xs text-ink-soft">{t("notUploaded")}</span>
        )}
      </div>
      {/* Not `disabled` while the upload is in flight, the same rule the list's
          filter bar follows: a disabled element cannot hold focus, so the
          browser blurs it to <body> and a keyboard user loses their place. The
          handler guards instead. */}
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={onChange}
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        aria-busy={pending}
        className="mt-2 block w-full text-sm text-ink-soft file:mr-3 file:border-0 file:bg-cobalt file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-linen hover:file:bg-cobalt-2"
      />
      {pending ? <p className="mt-1 font-mono text-xs text-ink-soft">{t("uploading")}</p> : null}
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
