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
      className={className}
    >
      {pending ? t("signingOut") : t("signOut")}
    </button>
  );
}
