"use client";

import { useEffect, useRef } from "react";

/**
 * Focus management for the app's one destructive-action pattern: click a
 * button, the button unmounts, and a confirm panel renders in its place.
 *
 * That swap silently breaks keyboard use. Focus was on the trigger, the trigger
 * is gone, so focus falls to `<body>`: a screen-reader user hears nothing and a
 * keyboard user has to tab from the top of the page (past the header, the nav
 * and the whole details form) to reach a Confirm button that is visually right
 * where they were. Cancelling then strands them again, because nothing puts
 * focus back.
 *
 * This hook does the two halves. On open, focus moves to the first control
 * inside the panel (the confirming action, so Enter confirms and Tab reaches
 * Cancel). On close, focus returns to the trigger that opened it, which is the
 * behaviour `account-menu.tsx` already implements by hand and the one the WAI
 * disclosure pattern expects.
 *
 * Announcement is the panel's own job: give its prompt `role="alert"` so the
 * appearance is spoken, since a plain `<p>` swapping in is not an event a
 * screen reader reports.
 *
 * Used by delete-button, transition-buttons (three panels), the board's card
 * menu, and passkeys-manager.
 */
export function useConfirmPanel<
  Panel extends HTMLElement = HTMLDivElement,
  Trigger extends HTMLElement = HTMLButtonElement,
>(open: boolean) {
  const panelRef = useRef<Panel>(null);
  const triggerRef = useRef<Trigger>(null);
  // Only act on a transition, never on an unrelated re-render: stealing focus
  // on every render would fight the user typing in the panel's own textarea.
  const wasOpen = useRef(open);

  useEffect(() => {
    if (open === wasOpen.current) return;
    wasOpen.current = open;

    if (open) {
      // Focusable children, in DOM order. The panel is small and hand-written,
      // so this list is the practical set rather than the exhaustive one.
      const first = panelRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), textarea, input:not([type="hidden"]), select, a[href]',
      );
      first?.focus();
    } else {
      // The trigger has just remounted (this runs after render), so the ref is
      // live again even though it was null while the panel was open.
      triggerRef.current?.focus();
    }
  }, [open]);

  return { panelRef, triggerRef };
}
