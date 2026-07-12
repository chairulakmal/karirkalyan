"use client";

import { useRouter } from "@/i18n/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Field } from "@/app/components/field";

// `/api/auth/session` answers with `{ error, code }`, mirroring the Rails API behind
// it. Localization keys off the machine-readable `code`, with the status map as the
// fallback — the same resolution order as `apiFailure()` in app/lib/actions.ts; see
// SPEC.md § Server-side error messages. Never string-match the `error` sentence.
//
// There is no per-field `details` arm here, unlike `apiFailure()`: sign-in is the only
// call this form makes, and it fails with `invalid_credentials`, never
// `validation_failed`. The registration path that used to produce field errors is gone
// (SPEC.md § Registration is closed).
const KEYED_STATUSES = new Set([403, 404, 409, 422, 429, 502, 503]);

type FailureBody = { code?: string } | null;

// One mode, no toggle: registration is closed, so signing in is the only thing
// this form can do. See SPEC.md § Registration is closed.
export function AuthForm() {
  const t = useTranslations("auth");
  const tErrors = useTranslations("errors");
  const router = useRouter();
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
    await doSignIn(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
  }

  async function onDemoSignIn() {
    setDemoPending(true);
    await doSignIn("demo@karirkalyan.com", "oretachinomachida");
    setDemoPending(false);
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

      <form action={onSubmit} className="space-y-4">
        <Field name="email" label={t("email")} type="email" autoComplete="email" required />
        <Field
          name="password"
          label={t("password")}
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
        />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-cobalt px-4 py-2.5 text-sm font-medium text-linen transition hover:bg-cobalt-2 disabled:opacity-50"
        >
          {pending ? t("signingIn") : t("signIn")}
        </button>
      </form>

      <p className="border-t border-dune pt-4 text-xs leading-relaxed text-ink-soft">
        {t("registrationClosed")}
      </p>
    </div>
  );
}
