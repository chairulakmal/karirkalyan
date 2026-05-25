import Link from "next/link";
import { SignUpForm } from "./sign-up-form";

export default function SignUpPage() {
  return (
    <>
      <p className="kk-label">Get started</p>
      <h1 className="mt-2 text-2xl">Create account</h1>
      <p className="mt-1 text-sm text-ink-soft">Minimum 8-character password.</p>
      <SignUpForm />
      <p className="mt-6 text-sm text-ink-soft">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-cobalt underline underline-offset-4 hover:text-cobalt-2">
          Sign in
        </Link>
      </p>
    </>
  );
}
