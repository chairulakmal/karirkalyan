"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function SignUpForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onSubmit(formData: FormData) {
    setError(null);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    const register = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!register.ok) {
      const body = (await register.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Sign up failed");
      return;
    }

    const session = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!session.ok) {
      const body = (await session.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Account created, but sign-in failed. Try the sign-in page.");
      return;
    }

    startTransition(() => {
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="mt-6 space-y-4">
      <Field name="email" label="Email" type="email" autoComplete="email" required />
      <Field name="password" label="Password" type="password" autoComplete="new-password" required minLength={8} />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full bg-cobalt px-4 py-2.5 text-sm font-medium text-linen transition hover:bg-cobalt-2 disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create account"}
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
