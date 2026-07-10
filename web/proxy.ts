import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/", "/sign-in", "/sign-up"];

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

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("session")?.value;

  // Fresh, unpredictable nonce per request.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    const response = NextResponse.redirect(url);
    response.headers.set("Content-Security-Policy", csp);
    return response;
  };

  if (pathname === "/" && token) {
    return redirectTo("/dashboard");
  }

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`)),
  );

  if (!isPublic && !token) {
    return redirectTo("/sign-in");
  }

  if (isPublic && token) {
    return redirectTo("/dashboard");
  }

  // Pass the nonce to Next on the request headers so SSR can read it and
  // attach it to framework/page scripts, then echo the CSP on the response.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Run on every route except Next internals, api routes, static assets, and
  // crawler metadata (robots/sitemap/llms.txt must stay reachable unauthenticated).
  // The api route handlers manage their own auth (they need to see /api/auth/* unauth).
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|robots.txt|sitemap.xml|llms.txt|brand/|.*\\.svg$|.*\\.png$).*)",
  ],
};
