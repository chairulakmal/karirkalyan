import Link from "next/link";
import { SignUpForm } from "./sign-up-form";

export default function SignUpPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
      <p className="mt-1 text-sm text-zinc-500">Minimum 8-character password.</p>
      <SignUpForm />
      <p className="mt-6 text-sm text-zinc-500">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-zinc-900 underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </>
  );
}
