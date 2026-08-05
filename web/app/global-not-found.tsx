import type { Metadata } from "next";
import { connection } from "next/server";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

/**
 * 404 for URLs that match no route at all.
 *
 * The root layout lives under a dynamic segment (`app/[locale]/layout.tsx`), so
 * there is no single layout Next can compose a global 404 from — the case the
 * `globalNotFound` flag exists for. Without this file, unmatched paths fall back
 * to Next's built-in bare document: no `lang`, no stylesheet, no fonts.
 *
 * Unlike `[locale]/not-found.tsx`, this bypasses normal rendering, so it must
 * return a full HTML document and import its own styles and fonts. The brand is
 * one family, declared here in exactly the same form as the root layout, so the
 * emitted file is content-hash-shared with it rather than a second copy in the
 * build. Keep the two call sites identical for that reason.
 *
 * Copy stays English: an unmatched path carries no locale to translate into.
 */

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Page not found — KarirKalyan",
  description: "That page does not exist or may have been removed.",
  robots: { index: false, follow: false },
};

export default async function GlobalNotFound() {
  // Same reason as the root layout: the CSP nonce is only applied during SSR, so
  // a prerendered 404 would ship scripts the production script-src blocks.
  await connection();

  return (
    <html lang="en" className={`${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full bg-sand text-midnight flex flex-col">
        <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
          <p className="kk-label">404</p>
          <h1 className="mt-2 text-3xl">Page not found</h1>
          <p className="mt-3 text-sm text-ink-soft">
            That page does not exist or may have been removed.
          </p>
          {/*
            A plain <a>, not next/link: this page is returned outside the normal
            app tree, so there is no client router to hand a soft navigation to.
            A document navigation is the only one guaranteed to work here.
          */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            className="mt-6 inline-block bg-cobalt px-4 py-2 text-sm font-medium text-linen transition hover:bg-cobalt-2"
          >
            Back to home
          </a>
        </main>
      </body>
    </html>
  );
}
