import Link from "next/link";
import { Mark, Wordmark } from "@/app/components/wordmark";
import { SignOutButton } from "./sign-out-button";
import { API_DOCS_URL, REPO_URL } from "@/app/lib/links";

export default function AppLayout({ children }: { children: React.ReactNode }) {

  return (
    <>
      <header className="border-b border-dune bg-linen">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="flex items-center gap-3">
            <Mark size={28} />
            <Wordmark size="sm" />
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <Link
              href="/dashboard"
              className="font-medium text-ink-soft hover:text-cobalt"
            >
              Dashboard
            </Link>
            <Link
              href="/applications/new"
              className="font-medium text-ink-soft hover:text-cobalt"
            >
              New
            </Link>
            <SignOutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">{children}</main>
      <footer className="border-t border-dune">
        <div className="mx-auto max-w-5xl px-6 py-5 text-xs text-ink-soft">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="kk-label">For reviewers</span>
            <ReviewerLink href={API_DOCS_URL}>API docs (Swagger)</ReviewerLink>
            <ReviewerLink href={REPO_URL}>Source</ReviewerLink>
          </div>
        </div>
      </footer>
    </>
  );
}

function ReviewerLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="underline underline-offset-4 hover:text-cobalt"
    >
      {children}
    </a>
  );
}
