import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const handleI18n = createMiddleware(routing);

// Locale-stripped paths. The guard never sees a `/ja` prefix, so these stay
// lists of a few entries rather than one entry per locale.
//
// PUBLIC: reachable *only* without a session. A signed-in visitor is bounced to
// the dashboard, so they never see the marketing or auth pages again.
const PUBLIC_PATHS = ["/", "/sign-in", "/sign-up"];

// OPEN: reachable either way, with no redirect in either direction. `/about` and
// `/docs` describe the project rather than selling it, so bouncing a signed-in
// reader to the dashboard would be hiding them from the people most likely to
// read them. This is why they are not simply more PUBLIC_PATHS entries.
const OPEN_PATHS = ["/about", "/docs"];

const isDev = process.env.NODE_ENV === "development";

// Content-Security-Policy is generated per request so script-src can carry a
// fresh nonce instead of 'unsafe-inline'. Next.js reads the nonce from the CSP
// on the request headers and stamps it onto its own inline/bootstrap scripts
// plus 'strict-dynamic' lets those trusted scripts load the rest of the bundle.
// style-src keeps 'unsafe-inline' because Next injects inline styles that are
// not nonced. 'unsafe-eval' stays dev-only (React/HMR need it in development).
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

/**
 * Splits `/ja/dashboard` into the prefix to preserve on redirect (`/ja`) and
 * the path the guard reasons about (`/dashboard`).
 *
 * `/en/*` is matched too, but yields an empty prefix: English is unprefixed, so
 * redirecting an `/en/*` visitor lands them on the canonical path. next-intl
 * would 307 them there anyway.
 */
function splitLocale(pathname: string): { prefix: string; path: string } {
  const match = pathname.match(/^\/(en|ja)(?=\/|$)/);
  if (!match) return { prefix: "", path: pathname };

  const locale = match[1];
  const rest = pathname.slice(match[0].length);
  return {
    prefix: locale === routing.defaultLocale ? "" : `/${locale}`,
    path: rest === "" ? "/" : rest,
  };
}

export function proxy(request: NextRequest) {
  const { prefix, path } = splitLocale(request.nextUrl.pathname);
  const token = request.cookies.get("session")?.value;

  // Fresh, unpredictable nonce per request.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  // Redirects stay inside the visitor's locale: a signed-in `/ja` visitor lands
  // on `/ja/dashboard`, not `/dashboard`.
  const redirectTo = (target: string) => {
    const url = request.nextUrl.clone();
    url.pathname = `${prefix}${target}`;
    const response = NextResponse.redirect(url);
    response.headers.set("Content-Security-Policy", csp);
    return response;
  };

  const matches = (paths: readonly string[]) =>
    paths.some((p) => path === p || (p !== "/" && path.startsWith(`${p}/`)));

  // Checked first: an open path skips both redirects below, whatever the token.
  if (!matches(OPEN_PATHS)) {
    const isPublic = matches(PUBLIC_PATHS);

    if (!isPublic && !token) {
      return redirectTo("/sign-in");
    }

    if (isPublic && token) {
      return redirectTo("/dashboard");
    }
  }

  // The guard passed. Hand off to next-intl, which resolves the locale and
  // returns either a rewrite (`/dashboard` → `/en/dashboard`) or a redirect
  // (`/en/dashboard` → `/dashboard`).
  //
  // The nonce rides in on the *request* headers, mutated in place: next-intl
  // does `new Headers(request.headers)` and hands the copy to the outgoing
  // request, so SSR can read `x-nonce` and stamp it onto page scripts. Setting
  // it on the response instead would never reach the renderer.
  //
  // Mutate rather than `new NextRequest(request, { headers })`: reconstructing
  // the request re-reads its body, and every server action arrives here as a
  // POST with one.
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", csp);

  const response = handleI18n(request);

  // Applies to both branches above — a redirect needs the CSP just as much as a
  // rendered page does.
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Run on every route except Next internals, api routes, static assets, and
  // crawler metadata (robots/sitemap/llms.txt must stay reachable unauthenticated).
  // The api route handlers manage their own auth (they need to see /api/auth/* unauth).
  //
  // No locale entry is needed: this excludes by leading path segment, and `/ja`
  // collides with none of them. The crawler files are never locale-prefixed.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|robots.txt|sitemap.xml|llms.txt|brand/|.*\\.svg$|.*\\.png$).*)",
  ],
};
