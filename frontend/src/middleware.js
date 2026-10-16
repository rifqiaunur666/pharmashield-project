/**
 * src/middleware.js
 * PharmaShield — Protected Route Middleware (Server-Side Session Guard).
 */
import { NextResponse } from 'next/server';

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Allow static files, api routes, and public assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/public') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const token =
    request.cookies.get('pharmashield_token')?.value ||
    request.cookies.get('pharmashield_session')?.value;

  const isAuthRoute = pathname === '/login' || pathname === '/register';

  // If unauthenticated and accessing protected route, force redirect to /login
  if (!token && !isAuthRoute) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') {
      loginUrl.searchParams.set('redirect', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // If already authenticated and accessing login or register, redirect to dashboard
  if (token && isAuthRoute) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
