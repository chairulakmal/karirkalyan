"use client";

import { useRouter } from "@/i18n/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Field } from "@/app/components/field";
import { isApiErrorDetail } from "@/app/lib/api-error";

type Mode = "sign-in" | "sign-up";

// `/api/auth/*` answers with `{ error, code, details? }`, mirroring the Rails
// API behind it. Localization keys off the machine-readable `code` (per-field
// `details` first), with the status map as the fallback — same resolution
// order as `apiFailure()` in app/lib/actions.ts; see SPEC.md § Server-side
// error messages. Never string-match the `error` sentence.
const KEYED_STATUSES = new Set([403, 404, 409, 422, 429, 502, 503]);

type FailureBody = { code?: string; details?: unknown } | null;

export function AuthForm({ defaultMode = "sign-in" }: { defaultMode?: Mode }) {
  const t = useTranslations("auth");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [demoPending, setDemoPending] = useState(false);

  const busy = pending || demoPending;

  // `overrides` names a catalog entry that reads better than the generic one
  // for that status — a 401 here means bad credentials, not a dead session.
  // It only applies when the body carries no code the catalog knows.
  function errorMessage(
    status: number,
    body: FailureBody,
    overrides: Record<number, string> = {},
  ): string {
    if (body?.code === "validation_failed" && Array.isArray(body.details)) {
      const messages = body.details
        .filter(isApiErrorDetail)
        .map((d) => `field.${d.field}_${d.code}`)
        .filter((key) => tErrors.has(key))
        .map((key) => tErrors(key));
      if (messages.length > 0) return messages.join(" ");
    }
    if (body?.code && tErrors.has(`code.${body.code}`)) {
      return tErrors(`code.${body.code}`);
    }
    return tErrors(
      overrides[status] ?? (KEYED_STATUSES.has(status) ? String(status) : "unknown"),
    );
  }

  async function failureBody(res: Response): Promise<FailureBody> {
    return (await res.json().catch(() => null)) as FailureBody;
  }

  async function doSignIn(email: string, password: string): Promise<boolean> {
    setError(null);
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      setError(errorMessage(res.status, await failureBody(res), { 401: "invalidCredentials" }));
      return false;
    }
    startTransition(() => {
      router.push("/dashboard");
      router.refresh();
    });
    return true;
  }

  async function onSubmit(formData: FormData) {
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    if (mode === "sign-in") {
      await doSignIn(email, password);
      return;
    }

    setError(null);
    const register = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!register.ok) {
      setError(
        errorMessage(register.status, await failureBody(register), {
          409: "signUpFailed",
          422: "signUpFailed",
        }),
      );
      return;
    }
    await doSignIn(email, password);
  }

  async function onDemoSignIn() {
    setDemoPending(true);
    await doSignIn("demo@karirkalyan.com", "oretachinomachida");
    setDemoPending(false);
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  return (
    <div className="mt-6 space-y-5">
      <button
        type="button"
        onClick={onDemoSignIn}
        disabled={busy}
        className="w-full border border-cobalt px-4 py-2.5 text-sm font-medium text-cobalt transition hover:bg-cobalt hover:text-linen disabled:opacity-50"
      >
        {demoPending ? t("loadingDemo") : t("tryDemoAccount")}
      </button>

      <div className="relative flex items-center">
        <div className="flex-grow border-t border-dune" />
        <span className="mx-3 flex-shrink-0 text-xs text-ink-soft">{t("or")}</span>
        <div className="flex-grow border-t border-dune" />
      </div>

      <div className="flex border border-dune text-sm font-medium">
        <button
          type="button"
          onClick={() => switchMode("sign-in")}
          className={`flex-1 py-2 transition ${
            mode === "sign-in"
              ? "bg-midnight text-linen"
              : "text-ink-soft hover:text-midnight"
          }`}
        >
          {t("signIn")}
        </button>
        <button
          type="button"
          onClick={() => switchMode("sign-up")}
          className={`flex-1 py-2 transition ${
            mode === "sign-up"
              ? "bg-midnight text-linen"
              : "text-ink-soft hover:text-midnight"
          }`}
        >
          {t("createAccount")}
        </button>
      </div>

      <form action={onSubmit} className="space-y-4">
        <Field name="email" label={t("email")} type="email" autoComplete="email" required />
        <Field
          name="password"
          label={t("password")}
          type="password"
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          required
          minLength={8}
        />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-cobalt px-4 py-2.5 text-sm font-medium text-linen transition hover:bg-cobalt-2 disabled:opacity-50"
        >
          {pending
            ? mode === "sign-in" ? t("signingIn") : t("creating")
            : mode === "sign-in" ? t("signIn") : t("createAccount")}
        </button>
      </form>
    </div>
  );
}
