// Origin allowlist check for the auth route handlers.
//
// Next's built-in CSRF protection only covers Server Actions, not route
// handlers, so a cross-site page could POST to /api/auth/session or
// /api/auth/register and drive a login/sign-up (login-CSRF). Requiring the
// request's Origin to match our own closes that: a cross-site caller sends its
// own Origin, which won't match.
//
// Browsers always send an Origin header on POST/DELETE fetches (same-origin
// included), so a missing Origin on these state-changing methods is itself
// suspect and rejected.
//
// By default the check is same-origin: Origin host must equal the request's
// Host header. Set ALLOWED_ORIGIN (comma-separated for several) to pin an
// explicit allowlist instead — useful when the browser-facing origin differs
// from the Host the app sees behind a proxy.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGIN ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

export function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }

  if (ALLOWED_ORIGINS.length > 0) {
    return ALLOWED_ORIGINS.some((allowed) => {
      try {
        return new URL(allowed).host === originHost;
      } catch {
        return allowed === origin || allowed === originHost;
      }
    });
  }

  // No explicit allowlist configured: fall back to same-origin.
  return originHost === request.headers.get("host");
}

// Standard 403 for a rejected cross-origin request to an auth route handler.
export function forbiddenOrigin(): Response {
  return Response.json({ error: "Cross-origin request rejected" }, { status: 403 });
}
