"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useTransition } from "react";

export function SignOutButton({
  className = "font-medium text-ink-soft hover:text-cobalt disabled:opacity-50",
}: {
  className?: string;
}) {
  const t = useTranslations("nav");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // The fetch runs inside the transition so `pending` disables the button
  // from the first click, not only after the request returns.
  function onClick() {
    startTransition(async () => {
      await fetch("/api/auth/session", { method: "DELETE" }).catch(() => null);
      // Home, not `/sign-in`: signing out is leaving, and the sign-in form is
      // one click away from the marketing page anyway. Landing on the form
      // reads as "you have been kicked out, sign back in", which is the
      // expired-session bounce's message, not this one's.
      router.push("/");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={className}
    >
      {pending ? t("signingOut") : t("signOut")}
    </button>
  );
}
