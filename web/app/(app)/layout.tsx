import Link from "next/link";
import { SignOutButton } from "./sign-out-button";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="font-semibold tracking-tight">
            KarirKalyan
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/dashboard" className="text-zinc-600 hover:text-zinc-900">
              Dashboard
            </Link>
            <Link href="/applications/new" className="text-zinc-600 hover:text-zinc-900">
              New
            </Link>
            <SignOutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
    </>
  );
}
