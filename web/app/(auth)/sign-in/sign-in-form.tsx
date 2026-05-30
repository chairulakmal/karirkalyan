"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Mode = "sign-in" | "sign-up";

export function AuthForm({ defaultMode = "sign-in" }: { defaultMode?: Mode }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [demoPending, setDemoPending] = useState(false);

  const busy = pending || demoPending;

  async function doSignIn(email: string, password: string): Promise<boolean> {
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
      const body = (await register.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Sign up failed");
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
        {demoPending ? "Loading demo…" : "Try demo account"}
      </button>

      <div className="relative flex items-center">
        <div className="flex-grow border-t border-dune" />
        <span className="mx-3 flex-shrink-0 text-xs text-ink-soft">or</span>
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
          Sign in
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
          Create account
        </button>
      </div>

      <form action={onSubmit} className="space-y-4">
        <Field name="email" label="Email" type="email" autoComplete="email" required />
        <Field
          name="password"
          label="Password"
          type="password"
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          required
          minLength={8}
        />
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-cobalt px-4 py-2.5 text-sm font-medium text-linen transition hover:bg-cobalt-2 disabled:opacity-50"
        >
          {pending
            ? mode === "sign-in" ? "Signing in…" : "Creating…"
            : mode === "sign-in" ? "Sign in" : "Create account"}
        </button>
      </form>
    </div>
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
