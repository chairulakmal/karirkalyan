import { NextResponse } from "next/server";
import { ACCOUNT_EMAIL_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/app/lib/api";

// Landing spot when the Rails API answers 401 (expired or revoked JWT).
// apiFetch redirects here because render contexts can't modify cookies;
// this handler clears the stale session cookie and sends the user to sign-in.
//
// The Location is deliberately relative. Behind Railway's proxy this process
// sees `Host: localhost:8080`, so an absolute URL built from `request.url`
// resolves to the internal origin — a real 307 to https://localhost:8080
// shipped exactly that way. A relative Location resolves against whatever
// origin the browser is already on.
//
// The path is unprefixed on purpose: the follow-up request goes through the
// proxy and next-intl, which resolve the locale from the NEXT_LOCALE cookie
// (SPEC.md § Auth flow), so a /ja session expires into /ja/sign-in without
// this handler owning a copy of the locale rules.
export async function GET() {
  const response = new NextResponse(null, {
    status: 307,
    headers: { Location: "/sign-in?expired=1" },
  });
  response.cookies.delete(SESSION_COOKIE_NAME);
  response.cookies.delete(ACCOUNT_EMAIL_COOKIE_NAME);
  return response;
}
