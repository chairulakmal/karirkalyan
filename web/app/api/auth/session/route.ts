import { cookies } from "next/headers";
import { INTERNAL_API_URL, SESSION_COOKIE_NAME } from "@/app/lib/api";
import { forbiddenOrigin, isAllowedOrigin } from "@/app/lib/csrf";
import { setSessionCookie } from "@/app/lib/session-cookie";

// POST = sign-in. Proxies email/password to Rails, captures the JWT from the
// Authorization response header, and stores it in an httpOnly cookie so it
// never reaches client JS.
export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) return forbiddenOrigin();

  const body = (await request.json().catch(() => null)) as {
    email?: string;
    password?: string;
  } | null;

  if (!body?.email || !body?.password) {
    return Response.json({ error: "Email and password required" }, { status: 400 });
  }

  const upstream = await fetch(`${INTERNAL_API_URL}/api/v1/auth/sign_in`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: { email: body.email, password: body.password } }),
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

  // Only a genuine 401 means bad credentials. Collapsing every non-OK status
  // into 401 once disguised a total API outage (host authorization was 403ing
  // every internal call) as "wrong password" for every user, demo included.
  // The copy is ours but the machine-readable `code` is passed through from
  // Rails so the form localizes off it.
  if (upstream.status === 401) {
    const payload = (await upstream.json().catch(() => null)) as {
      code?: string;
    } | null;
    return Response.json(
      {
        error: "Invalid email or password",
        code: payload?.code ?? "invalid_credentials",
      },
      { status: 401 },
    );
  }

  if (!upstream.ok) {
    console.error(`sign_in upstream failed: ${upstream.status} ${upstream.statusText}`);
    return Response.json({ error: "Sign-in is unavailable right now" }, { status: 502 });
  }

  const token = upstream.headers.get("Authorization");
  if (!token) {
    return Response.json({ error: "No token returned from API" }, { status: 502 });
  }

  await setSessionCookie(token);
  return Response.json({ ok: true });
}

// DELETE = sign-out. Rotates the JTI on the Rails side, then clears the cookie.
export async function DELETE(request: Request) {
  if (!isAllowedOrigin(request)) return forbiddenOrigin();

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await fetch(`${INTERNAL_API_URL}/api/v1/auth/sign_out`, {
      method: "DELETE",
      headers: { Authorization: token },
    });
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
  return Response.json({ ok: true });
}
