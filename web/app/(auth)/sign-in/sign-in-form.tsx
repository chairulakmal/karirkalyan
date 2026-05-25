"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function SignInForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onSubmit(formData: FormData) {
    setError(null);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Sign in failed");
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
      <Field name="password" label="Password" type="password" autoComplete="current-password" required minLength={8} />
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
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
