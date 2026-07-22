"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useToast } from "@/app/components/toast";

/**
 * Fires a one-shot toast for a `?toast=<key>` signal that a redirect left behind
 * (v1.11.0). A delete navigates away before it could toast in place, so the
 * action redirects to `/dashboard?toast=deleted`; this reads the key once, shows
 * the toast, and strips the param (via `replace`, no history) so a reload does
 * not repeat it. `useSearchParams` is a read hook, not navigation, so it stays on
 * `next/navigation`; the `replace` that rewrites the URL goes through
 * `i18n/navigation` like every other navigation. Renders nothing.
 */
export function ToastFromParam() {
  const toast = useToast();
  const t = useTranslations("toast");
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fired = useRef(false);
  const key = params.get("toast");

  useEffect(() => {
    if (fired.current || !key) return;
    fired.current = true;
    if (key === "deleted") toast.success(t("deleted"));
    const next = new URLSearchParams(params);
    next.delete("toast");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // Keyed on the signal only; the one-shot ref guards against re-firing, and
    // the other identities are stable across the renders this runs in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return null;
}
