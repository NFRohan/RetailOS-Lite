import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const session = await auth();
  const { pathname } = request.nextUrl;

  const isRepRoute = pathname.startsWith("/rep");
  const isSupervisorRoute = pathname.startsWith("/supervisor");
  const isProtected = isRepRoute || isSupervisorRoute;

  if (!isProtected) return NextResponse.next();

  if (!session?.user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isRepRoute && session.user.role !== "REP") {
    return NextResponse.redirect(new URL("/supervisor", request.url));
  }

  if (isSupervisorRoute && session.user.role !== "SUPERVISOR" && session.user.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/rep/visits", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/rep/:path*", "/supervisor/:path*"],
};
