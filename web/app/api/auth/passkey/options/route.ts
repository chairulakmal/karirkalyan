import { INTERNAL_API_URL } from "@/app/lib/api";
import { forbiddenOrigin, isAllowedOrigin } from "@/app/lib/csrf";

// First leg of the passkey sign-in ceremony (SPEC.md § Auth flow, § Passkeys):
// proxies the assertion-options request to Rails and returns the ceremony JSON
// as-is — there is no token in it, so nothing needs lifting into a cookie yet.
// Origin-checked like every auth route handler: login-CSRF applies to a
// passkey login too.
export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) return forbiddenOrigin();

  const upstream = await fetch(`${INTERNAL_API_URL}/api/v1/auth/passkey/options`, {
    method: "POST",
  });

  const body = (await upstream.json().catch(() => null)) as Record<string, unknown> | null;
  if (body === null) {
    console.error(`passkey options upstream failed: ${upstream.status} ${upstream.statusText}`);
    return Response.json({ error: "Passkey sign-in is unavailable right now" }, { status: 502 });
  }

  // Pass failures (429 rate_limited and friends) through with their code so
  // the form localizes off it, same as the password handler.
  return Response.json(body, { status: upstream.status });
}
