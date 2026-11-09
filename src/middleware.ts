import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionCookie } from '@/lib/session';

function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(self), geolocation=()'
  );
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https: blob:; font-src 'self' data: https:; media-src 'self' https: data: blob:; connect-src 'self' https:; frame-ancestors 'none';"
  );
  return response;
}

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/aspirants-connect',
  '/profile',
  '/study-groups',
  '/leaderboard',
];

export function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get('user_session')?.value;
  const verifiedSessionUuid = verifySessionCookie(sessionCookie);
  const normalizedPath = request.nextUrl.pathname.toLowerCase();

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)
  );

  if (!verifiedSessionUuid && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.searchParams.set('login', 'true');
    const redirectResponse = NextResponse.redirect(url);
    return addSecurityHeaders(redirectResponse);
  }

  // Redirect logged in users away from auth pages
  if (verifiedSessionUuid && normalizedPath.startsWith('/auth')) {
    const redirectResponse = NextResponse.redirect(
      new URL('/dashboard', request.url)
    );
    return addSecurityHeaders(redirectResponse);
  }

  const response = NextResponse.next();
  return addSecurityHeaders(response);
}

export const config = {
  matcher: [
    '/dashboard',
    '/dashboard/:path*',
    '/aspirants-connect',
    '/aspirants-connect/:path*',
    '/profile/:path*',
    '/study-groups',
    '/study-groups/:path*',
    '/leaderboard',
    '/leaderboard/:path*',
    '/auth/:path*',
  ],
};
