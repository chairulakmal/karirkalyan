import { cookies } from "next/headers";
import { API_BASE, SESSION_COOKIE_NAME } from "@/app/lib/api";
import { forbiddenOrigin, isAllowedOrigin } from "@/app/lib/csrf";

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

  const upstream = await fetch(`${API_BASE}/api/v1/auth/sign_in`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: { email: body.email, password: body.password } }),
  });

  if (upstream.status === 429) {
    const retryAfter = upstream.headers.get("Retry-After") ?? "60";
    return Response.json(
      { error: `Too many sign-in attempts. Try again in ${retryAfter}s.` },
      { status: 429 },
    );
  }

  if (!upstream.ok) {
    return Response.json({ error: "Invalid email or password" }, { status: 401 });
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
    await fetch(`${API_BASE}/api/v1/auth/sign_out`, {
      method: "DELETE",
      headers: { Authorization: token },
    });
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
  return Response.json({ ok: true });
}

async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 1 day — matches Devise JWT expiration_time
  });
}
