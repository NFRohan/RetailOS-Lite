import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

type SessionRole = "REP" | "SUPERVISOR" | "ADMIN";

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  const { pathname } = request.nextUrl;

  const isRepRoute = pathname.startsWith("/rep");
  const isSupervisorRoute = pathname.startsWith("/supervisor");
  const isProtected = isRepRoute || isSupervisorRoute;

  if (!isProtected) return NextResponse.next();

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = token.role as SessionRole | undefined;

  if (isRepRoute && role !== "REP") {
    return NextResponse.redirect(new URL("/supervisor", request.url));
  }

  if (isSupervisorRoute && role !== "SUPERVISOR" && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/rep/visits", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/rep/:path*", "/supervisor/:path*"],
};
