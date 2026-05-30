"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function SignInForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [demoPending, setDemoPending] = useState(false);

  async function signIn(email: string, password: string): Promise<boolean> {
    setError(null);
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Sign in failed");
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
    await signIn(email, password);
  }

  async function onDemoSignIn() {
    setDemoPending(true);
    await signIn("demo@karirkalyan.com", "oretachinomachida");
    setDemoPending(false);
  }

  const busy = pending || demoPending;

  return (
    <form action={onSubmit} className="mt-6 space-y-4">
      <Field name="email" label="Email" type="email" autoComplete="email" required />
      <Field name="password" label="Password" type="password" autoComplete="current-password" required minLength={8} />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="w-full bg-cobalt px-4 py-2.5 text-sm font-medium text-linen transition hover:bg-cobalt-2 disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>

      <div className="relative flex items-center py-1">
        <div className="flex-grow border-t border-dune" />
        <span className="mx-3 flex-shrink-0 text-xs text-ink-soft">or</span>
        <div className="flex-grow border-t border-dune" />
      </div>

      <button
        type="button"
        onClick={onDemoSignIn}
        disabled={busy}
        className="w-full border border-dune px-4 py-2.5 text-sm font-medium text-midnight transition hover:bg-dune disabled:opacity-50"
      >
        {demoPending ? "Loading demo…" : "Try demo account"}
      </button>
    </form>
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
