import { AuthForm } from "./sign-in-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const { expired } = await searchParams;

  return (
    <>
      <p className="kk-label">Welcome</p>
      <h1 className="mt-2 text-2xl">KarirKalyan</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Track applications, transitions, and reminders.
      </p>
      {expired && (
        <p
          role="status"
          className="mt-4 border border-saffron bg-linen px-4 py-3 text-sm text-midnight"
        >
          Your session expired. Sign in again to continue.
        </p>
      )}
      <AuthForm defaultMode="sign-in" />
    </>
  );
}
