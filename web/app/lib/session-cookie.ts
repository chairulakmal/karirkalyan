import { cookies } from "next/headers";
import { ACCOUNT_EMAIL_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/app/lib/api";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24, // 1 day, matches Devise JWT expiration_time
} as const;

// Stores the Rails-issued JWT in the httpOnly `session` cookie (the one write
// that keeps the token out of client JS, SPEC.md § Auth flow) and the email
// from the same sign-in response in the httpOnly `account_email` cookie beside
// it, so the header's account chip never has to fetch. Shared by the password
// and passkey sign-in route handlers, which is why it lives here and not
// inside either route file.
export async function setSessionCookies(token: string, email: string | undefined) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, COOKIE_OPTIONS);
  if (email) {
    cookieStore.set(ACCOUNT_EMAIL_COOKIE_NAME, email, COOKIE_OPTIONS);
  } else {
    // A sign-in response without an email should not leave a previous
    // account's label behind; the chip degrades to its neutral glyph instead.
    cookieStore.delete(ACCOUNT_EMAIL_COOKIE_NAME);
  }
}
