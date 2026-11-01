import { NextRequest, NextResponse } from "next/server";

const REFRESH_COOKIE = "refresh_token";

// Define which paths require authentication
const PROTECTED_PREFIXES = ["/dashboard", "/settings", "/billing"];
const AUTH_PAGES = ["/login", "/register", "/signup","/accept-invite"];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
}

function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.some((p) => pathname.startsWith(p));
}

export default function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Skip API routes and static assets
  if (pathname.startsWith("/api") || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  // Check for the presence of the refresh token cookie
  const isAuthenticated = Boolean(req.cookies.get(REFRESH_COOKIE)?.value);

  // Redirect unauthenticated users away from protected routes
  if (isProtected(pathname) && !isAuthenticated) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages (e.g., login)
  if (isAuthPage(pathname) && isAuthenticated) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Match all request paths except for the ones starting with:
  // - api (API routes)
  // - _next/static (static files)
  // - _next/image (image optimization files)
  // - favicon.ico (favicon file)
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};