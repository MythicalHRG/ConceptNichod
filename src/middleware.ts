import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyEdgeSessionCookie } from '@/lib/edge-session';

function addSecurityHeaders(response: NextResponse): NextResponse {
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload'
    );
  }
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(self), geolocation=()'
  );
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https: blob:; font-src 'self' data: https:; media-src 'self' https: data: blob:; connect-src 'self' https:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';"
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

export async function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get('user_session')?.value;
  const verifiedSessionUuid = await verifyEdgeSessionCookie(sessionCookie);
  const normalizedPath = request.nextUrl.pathname.toLowerCase();

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)
  );

  if (!verifiedSessionUuid && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '?login=true';
    const redirectResponse = NextResponse.redirect(url);
    return addSecurityHeaders(redirectResponse);
  }

  // Redirect logged in users away from auth pages
  if (verifiedSessionUuid && normalizedPath.startsWith('/auth')) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = '/dashboard';
    dashboardUrl.search = '';
    const redirectResponse = NextResponse.redirect(dashboardUrl);
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
    '/profile',
    '/profile/:path*',
    '/study-groups',
    '/study-groups/:path*',
    '/leaderboard',
    '/leaderboard/:path*',
    '/auth/:path*',
  ],
};
