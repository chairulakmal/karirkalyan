import { INTERNAL_API_URL } from "@/app/lib/api";
import { forbiddenOrigin, isAllowedOrigin } from "@/app/lib/csrf";
import { setSessionCookie } from "@/app/lib/session-cookie";

// Second leg of the passkey sign-in ceremony (SPEC.md § Auth flow, § Passkeys):
// proxies the assertion to Rails, captures the JWT from the Authorization
// response header, and stores it in the same httpOnly cookie the password
// handler uses — from here the session is indistinguishable from a password one.
export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) return forbiddenOrigin();

  const body = (await request.json().catch(() => null)) as {
    challenge?: string;
    credential?: unknown;
  } | null;

  if (!body?.challenge || !body?.credential) {
    return Response.json({ error: "Challenge and credential required" }, { status: 400 });
  }

  const upstream = await fetch(`${INTERNAL_API_URL}/api/v1/auth/passkey`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challenge: body.challenge, credential: body.credential }),
  });

  if (upstream.status === 429) {
    const retryAfter = upstream.headers.get("Retry-After") ?? "60";
    return Response.json(
      {
        error: `Too many sign-in attempts. Try again in ${retryAfter}s.`,
        code: "rate_limited",
      },
      { status: 429 },
    );
  }

  // Only a genuine 401 means the passkey was refused — the same rule the
  // password handler enforces, so an API outage never reads as a bad passkey.
  if (upstream.status === 401) {
    const payload = (await upstream.json().catch(() => null)) as {
      code?: string;
    } | null;
    return Response.json(
      {
        error: "Passkey sign-in failed",
        code: payload?.code ?? "invalid_passkey",
      },
      { status: 401 },
    );
  }

  if (!upstream.ok) {
    console.error(`passkey sign-in upstream failed: ${upstream.status} ${upstream.statusText}`);
    return Response.json({ error: "Sign-in is unavailable right now" }, { status: 502 });
  }

  const token = upstream.headers.get("Authorization");
  if (!token) {
    return Response.json({ error: "No token returned from API" }, { status: 502 });
  }

  await setSessionCookie(token);
  return Response.json({ ok: true });
}
