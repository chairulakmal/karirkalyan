import { NewApplicationForm } from "./new-application-form";

export default function NewApplicationPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">New application</h1>
      <p className="mt-1 text-sm text-zinc-500">Start in <code>wishlist</code> or <code>draft</code>. Status changes go through the FSM.</p>
      <NewApplicationForm />
    </div>
  );
}
