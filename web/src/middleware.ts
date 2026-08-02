import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/dashboard", "/profile", "/tokens", "/graphs"];

/**
 * Cheap cookie-presence gate so signed-out visitors bounce to /login without
 * rendering a page first. This is NOT the authorisation check - middleware
 * runs on the edge runtime and cannot reach Prisma. Every protected page and
 * server action independently calls requireUser(), which validates the
 * session against the database.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  if (request.cookies.has("gsp_session")) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard/:path*", "/profile/:path*", "/tokens/:path*", "/graphs/:path*"],
};
