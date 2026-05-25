import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/sign-in", "/sign-up"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("session")?.value;

  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = token ? "/dashboard" : "/sign-in";
    return NextResponse.redirect(url);
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!isPublic && !token) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    return NextResponse.redirect(url);
  }

  if (isPublic && token) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on every route except Next internals and api routes.
  // The api route handlers manage their own auth (they need to see /api/auth/* unauth).
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.png$).*)"],
};
