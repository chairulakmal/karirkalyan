import { API_BASE } from "@/app/lib/api";
import { forbiddenOrigin, isAllowedOrigin } from "@/app/lib/csrf";

// POST = sign-up. Creates the account on Rails; does NOT sign the user in.
// Sign-up returns 201 + user JSON only. The client then calls /api/auth/session
// to obtain a token.
export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) return forbiddenOrigin();

  const body = (await request.json().catch(() => null)) as {
    email?: string;
    password?: string;
  } | null;

  if (!body?.email || !body?.password) {
    return Response.json({ error: "Email and password required" }, { status: 400 });
  }

  const upstream = await fetch(`${API_BASE}/api/v1/auth/sign_up`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: { email: body.email, password: body.password } }),
  });

  if (upstream.status === 429) {
    const retryAfter = upstream.headers.get("Retry-After") ?? "3600";
    return Response.json(
      {
        error: `Too many sign-up attempts. Try again in ${retryAfter}s.`,
        code: "rate_limited",
      },
      { status: 429 },
    );
  }

  const payload = await upstream.json().catch(() => ({}));

  if (!upstream.ok) {
    // Rails answers `{ error, code, details? }` — forward the envelope intact
    // so the form can localize off `code` / `details[].field`.
    const { error, code, details } = payload as {
      error?: string;
      code?: string;
      details?: unknown;
    };
    return Response.json(
      { error: error ?? "Unable to create account", code, details },
      { status: upstream.status },
    );
  }

  return Response.json(payload, { status: 201 });
}
