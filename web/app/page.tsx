import Link from "next/link";
import { Mark, Wordmark } from "@/app/components/wordmark";

const REPO_URL = "https://github.com/chairulakmal/karirkalyan";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-6 md:px-12">
        <div className="flex items-center gap-3">
          <Mark size={32} />
          <Wordmark size="md" />
        </div>
        <nav className="flex items-center gap-6 text-sm">
          <Link
            href="/sign-in"
            className="font-medium text-cobalt underline underline-offset-4 hover:text-cobalt-2"
          >
            Sign in
          </Link>
        </nav>
      </header>

      <main className="flex flex-1 items-center px-6 py-16 md:px-12">
        <div className="mx-auto w-full max-w-3xl">
          <p className="kk-label">For tech jobseekers</p>
          <h1 className="mt-3 text-4xl leading-tight md:text-6xl">
            Track every application,{" "}
            <span className="italic text-cobalt">without the spreadsheet</span>.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-ink-soft">
            From <em>applied</em> to <em>offer</em>, KarirKalyan keeps your job
            hunt organized with a state machine that doesn&apos;t let you skip
            steps &mdash; plus follow-up reminders so warm leads don&apos;t go
            cold.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              href="/sign-up"
              className="inline-flex items-center justify-center bg-cobalt px-6 py-3 text-sm font-medium text-linen transition hover:bg-cobalt-2"
            >
              Get started
            </Link>
            <Link
              href="/sign-in"
              className="inline-flex items-center justify-center border border-midnight px-6 py-3 text-sm font-medium text-midnight transition hover:bg-linen"
            >
              Sign in
            </Link>
            <Link
              href={REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="ml-1 inline-flex items-center gap-2 px-2 py-3 text-sm text-ink-soft transition hover:text-midnight"
            >
              <GitHubIcon className="h-4 w-4" />
              Source code
            </Link>
          </div>

          <ul className="mt-20 grid gap-8 md:grid-cols-3">
            <li className="border-l border-dune pl-4">
              <p className="kk-label">FSM-backed</p>
              <p className="mt-2 text-sm text-ink-soft">
                Status changes follow an explicit transition table. No
                accidental jumps from <em>applied</em> to <em>offer</em>.
              </p>
            </li>
            <li className="border-l border-dune pl-4">
              <p className="kk-label">Resume per role</p>
              <p className="mt-2 text-sm text-ink-soft">
                Attach the exact resume and cover letter you sent. See what
                landed interviews three months later.
              </p>
            </li>
            <li className="border-l border-dune pl-4">
              <p className="kk-label">Follow-up reminders</p>
              <p className="mt-2 text-sm text-ink-soft">
                Idempotent background jobs ping you when a recruiter has been
                quiet for a week.
              </p>
            </li>
          </ul>
        </div>
      </main>

      <footer className="border-t border-dune px-6 py-6 text-xs text-ink-soft md:px-12">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <p>&copy; 2026 Chairul Akmal</p>
          <p className="flex items-center gap-4">
            <Link
              href={`${REPO_URL}/blob/main/LICENSE`}
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-4 hover:text-midnight"
            >
              MIT License
            </Link>
            <Link
              href={REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-1.5 hover:text-midnight"
              aria-label="GitHub repository"
            >
              <GitHubIcon className="h-3.5 w-3.5" />
              <span>GitHub</span>
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 .5C5.73.5.75 5.48.75 11.75c0 4.99 3.23 9.21 7.71 10.7.56.1.77-.24.77-.54 0-.27-.01-.97-.02-1.91-3.14.68-3.8-1.51-3.8-1.51-.52-1.31-1.27-1.66-1.27-1.66-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.25 3.34.95.1-.74.4-1.25.72-1.54-2.51-.29-5.15-1.25-5.15-5.58 0-1.23.44-2.24 1.17-3.03-.12-.29-.51-1.45.11-3.02 0 0 .96-.31 3.14 1.16a10.94 10.94 0 0 1 5.72 0c2.18-1.47 3.13-1.16 3.13-1.16.62 1.57.23 2.73.12 3.02.73.79 1.17 1.8 1.17 3.03 0 4.34-2.65 5.29-5.17 5.57.41.35.77 1.04.77 2.1 0 1.52-.01 2.74-.01 3.11 0 .3.2.65.78.54 4.47-1.5 7.7-5.71 7.7-10.7C23.25 5.48 18.27.5 12 .5z" />
    </svg>
  );
}
