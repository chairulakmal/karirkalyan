import { NewApplicationForm } from "./new-application-form";

export default function NewApplicationPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <p className="kk-label">Track a new opportunity</p>
      <h1 className="mt-1 text-3xl">New application</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Start in <code className="font-mono">wishlist</code> or{" "}
        <code className="font-mono">draft</code>. Status changes go through the FSM.
      </p>
      <NewApplicationForm />
    </div>
  );
}
