import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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

export function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get('user_session')?.value;

  if (!sessionCookie && request.nextUrl.pathname.startsWith('/dashboard')) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.searchParams.set('login', 'true');
    const redirectResponse = NextResponse.redirect(url);
    return addSecurityHeaders(redirectResponse);
  }

  // Redirect logged in users away from auth pages
  if (sessionCookie && request.nextUrl.pathname.startsWith('/auth')) {
    const redirectResponse = NextResponse.redirect(
      new URL('/dashboard', request.url)
    );
    return addSecurityHeaders(redirectResponse);
  }

  const response = NextResponse.next();
  return addSecurityHeaders(response);
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
