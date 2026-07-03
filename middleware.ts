import { NextResponse, type NextRequest } from "next/server";

type SessionPayload = {
  user?: {
    role?: string | null;
  } | null;
} | null;

async function getMiddlewareSession(request: NextRequest) {
  try {
    const response = await fetch(new URL("/api/auth/get-session", request.url), {
      headers: {
        cookie: request.headers.get("cookie") ?? "",
      },
    });

    if (!response.ok) return null;
    return (await response.json()) as SessionPayload;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await getMiddlewareSession(request);
  const role = session?.user?.role;

  if (pathname.startsWith("/medis")) {
    if (role === "medis" || role === "super_admin") {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL(role ? "/" : "/staff", request.url));
  }

  if (pathname.startsWith("/admin")) {
    if (role === "admin" || role === "super_admin") {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL(role ? "/" : "/staff", request.url));
  }

  if (pathname === "/staff" && role === "pasien") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/medis/:path*", "/admin/:path*", "/staff"],
};
