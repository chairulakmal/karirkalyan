/**
 * ⓘ disclosure — the one help affordance in the app. Native <details> keeps it
 * JS-free and keyboard-accessible, and — unlike a hover tooltip — the panel
 * stays open while the user reads and works on touch screens. Not a <button>,
 * so e2e selectors for real actions (getByRole("button")) can never match it.
 *
 * The global :focus-visible ring covers keyboard focus; don't re-declare it.
 */
export function InfoPopover({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <details className="relative inline-block align-middle">
      <summary
        aria-label={label}
        title={label}
        className="list-none cursor-help select-none text-ink-soft/50 transition-colors hover:text-ink-soft [&::-webkit-details-marker]:hidden"
      >
        ⓘ
      </summary>
      <div className="absolute left-0 top-full z-10 mt-2 w-80 max-w-[85vw] border border-dune bg-linen p-4 shadow-lg">
        {children}
      </div>
    </details>
  );
}
