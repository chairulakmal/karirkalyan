import Link from "next/link";
import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm text-zinc-500">Track your applications, transitions, and reminders.</p>
      <SignInForm />
      <p className="mt-6 text-sm text-zinc-500">
        Don&apos;t have an account?{" "}
        <Link href="/sign-up" className="font-medium text-zinc-900 underline underline-offset-4">
          Sign up
        </Link>
      </p>
    </>
  );
}
