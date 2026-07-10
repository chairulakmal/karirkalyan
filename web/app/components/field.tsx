// Shared label + input used by the sign-in, new-application, and details-editor
// forms. Keeping one source of truth avoids drift and preserves the label→input
// association the e2e specs rely on (getByLabel).
export function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
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
