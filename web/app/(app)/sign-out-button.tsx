"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function SignOutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function onClick() {
    await fetch("/api/auth/session", { method: "DELETE" });
    startTransition(() => {
      router.push("/sign-in");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="text-zinc-600 hover:text-zinc-900 disabled:opacity-50"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
