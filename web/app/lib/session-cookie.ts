import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/app/lib/api";

// Stores the Rails-issued JWT in the httpOnly `session` cookie — the one write
// that keeps the token out of client JS (SPEC.md § Auth flow). Shared by the
// password and passkey sign-in route handlers, which is why it lives here and
// not inside either route file.
export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 1 day — matches Devise JWT expiration_time
  });
}
