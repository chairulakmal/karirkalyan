import { AuthForm } from "@/app/(auth)/sign-in/sign-in-form";

export default function SignUpPage() {
  return (
    <>
      <p className="kk-label">Welcome</p>
      <h1 className="mt-2 text-2xl">KarirKalyan</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Track applications, transitions, and reminders.
      </p>
      <AuthForm defaultMode="sign-up" />
    </>
  );
}
