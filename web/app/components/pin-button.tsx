"use client";

import { useTranslations } from "next-intl";

/**
 * The pin toggle on a dashboard list row (SPEC.md § Pinned applications).
 *
 * Three things about it are deliberate. It is a **sibling** of the row's link,
 * never a child: a button inside an anchor is invalid HTML, and browsers recover
 * from it by making the whole row ambiguous to click and to a screen reader. It
 * renders on **every** row rather than appearing on hover, because this is an
 * Android-first PWA and hover does not exist on the device it is built for. And
 * the pinned state is carried by the **shape** of the icon (filled against
 * outline) as well as by its colour, so it survives WCAG 1.4.1 the same way the
 * filter chips' real checkboxes do.
 */
export function PinButton({
  pinned,
  company,
  onToggle,
}: {
  pinned: boolean;
  company: string;
  onToggle: () => void;
}) {
  const t = useTranslations("list.pin");
  return (
    <button
      type="button"
      // A toggle button, so the state belongs in `aria-pressed` rather than in
      // two different accessible names. The label stays the action either way.
      aria-pressed={pinned}
      onClick={onToggle}
      // The accessible name names the application; the tooltip does not. Ten
      // rows of an identically-labelled "Pin to top" is a list a screen-reader
      // user cannot navigate, since the button is the only thing in the row that
      // is not inside the link that already says which company it is. The
      // tooltip stays short because a sighted user reads it beside that name.
      title={pinned ? t("removeShort") : t("addShort")}
      aria-label={pinned ? t("remove", { company }) : t("add", { company })}
      className={`flex size-11 shrink-0 items-center justify-center transition ${
        pinned ? "text-saffron-ink" : "text-ink-soft hover:text-midnight"
      }`}
    >
      <PinIcon filled={pinned} />
    </button>
  );
}

// A pushpin seen from the side: head, shaft, point. Drawn rather than pulled from
// an icon set, which is the same call `github-icon.tsx` made; one icon does not
// earn a dependency. `filled` swaps the head from outline to solid, which is the
// non-colour half of the state.
function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className="size-5"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden
    >
      {/* The head, angled the way a pin sits when it is pushed in. */}
      <path d="M11.5 2.5 17.5 8.5 14.5 9.5 12 15 5 8 10.5 5.5Z" />
      {/* The shaft always draws as a line, so a pinned row and an unpinned one
          have the same silhouette apart from the head. */}
      <path d="M5 15 8.5 11.5" fill="none" />
    </svg>
  );
}
