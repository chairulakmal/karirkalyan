import Link from "next/link";
import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <>
      <p className="kk-label">Welcome back</p>
      <h1 className="mt-2 text-2xl">Sign in</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Track applications, transitions, and reminders.
      </p>
      <SignInForm />
      <p className="mt-6 text-sm text-ink-soft">
        Don&apos;t have an account?{" "}
        <Link href="/sign-up" className="font-medium text-cobalt underline underline-offset-4 hover:text-cobalt-2">
          Sign up
        </Link>
      </p>
    </>
  );
}
