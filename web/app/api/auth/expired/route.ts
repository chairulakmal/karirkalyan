import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/app/lib/api";

// Landing spot when the Rails API answers 401 (expired or revoked JWT).
// apiFetch redirects here because render contexts can't modify cookies;
// this handler clears the stale session cookie and sends the user to sign-in.
export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  return NextResponse.redirect(new URL("/sign-in?expired=1", request.url));
}
