"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { SignOutButton } from "./sign-out-button";

/**
 * The header's account chip + menu (SPEC.md § Auth flow): Settings and Sign
 * out behind a square initials chip, at every width. A plain disclosure, not
 * an ARIA menu (two links do not earn roving focus). The chip is square on
 * purpose: radius 0 is the design system, and the circle convention signals a
 * person's photo, which this app never has.
 *
 * `email` comes from the httpOnly `account_email` cookie via the layout, as a
 * prop, never fetched (ProfileCard's rule, SPEC.md § Exports). It is null for
 * sessions minted before the cookie existed; the chip then falls back to a
 * neutral glyph, and both entries still work.
 */
export function AccountMenu({ email }: { email: string | null }) {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // One initial from the email local part, never from a name, which the data
  // model doesn't hold and whose initials are culturally fraught anyway.
  const initial = email?.split("@")[0]?.trim().charAt(0).toUpperCase();
  const label = email ? `${t("account")}: ${email}` : t("account");

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        onClick={() => setOpen((current) => !current)}
        className="flex size-8 items-center justify-center bg-cobalt text-sm font-medium text-linen transition hover:bg-cobalt-2"
      >
        {initial || "@"}
      </button>
      {/* Always in the DOM so aria-controls has a target while closed; hidden
          toggles visibility. z-20 clears the sticky tab bar's z-10, the same
          precedent board.tsx sets for its menus. */}
      <div
        id={panelId}
        hidden={!open}
        className="absolute right-0 top-full z-20 mt-2 w-56 border border-dune bg-linen py-1 shadow-lg"
      >
        {email && (
          <p className="break-all border-b border-dune px-4 py-2 text-xs text-ink-soft">
            {email}
          </p>
        )}
        <Link
          href="/settings"
          onClick={() => setOpen(false)}
          className="block px-4 py-2 font-medium hover:text-cobalt"
        >
          {t("settings")}
        </Link>
        <SignOutButton className="block w-full px-4 py-2 text-left font-medium text-ink-soft hover:text-cobalt disabled:opacity-50" />
      </div>
    </div>
  );
}
