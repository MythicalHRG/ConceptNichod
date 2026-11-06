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

export async function middleware(request: NextRequest) {
  return handleRequest(request);
}

async function hasValidSession(cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue) return false;

  const separator = cookieValue.lastIndexOf('.');
  if (separator <= 0) return false;

  const uuid = cookieValue.slice(0, separator);
  const signatureHex = cookieValue.slice(separator + 1);
  if (!/^[0-9a-f]{64}$/i.test(signatureHex)) return false;

  const secret = process.env.SESSION_SECRET || process.env.ENCRYPTION_SECRET_KEY ||
    (process.env.NODE_ENV !== 'production' ? 'local-development-only-session-secret' : '');
  if (secret.length < 32) return false;

  const signature = new Uint8Array(signatureHex.length / 2);
  for (let index = 0; index < signature.length; index += 1) {
    signature[index] = Number.parseInt(signatureHex.slice(index * 2, index * 2 + 2), 16);
  }

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify(
      'HMAC',
      key,
      signature,
      new TextEncoder().encode(uuid),
    );
  } catch {
    return false;
  }
}

async function handleRequest(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;
  const staticAssets = new Set(['/qr.png', '/ambient.mp3', '/favicon.ico']);

  // Login, sign-up, OTP, and other API handlers enforce access themselves.
  if (
    request.method !== 'GET' && request.method !== 'HEAD' ||
    pathname === '/api' || pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') || staticAssets.has(pathname)
  ) {
    return addSecurityHeaders(NextResponse.next());
  }

  const sessionCookie = request.cookies.get('user_session')?.value;
  const authenticated = await hasValidSession(sessionCookie);

  if (!authenticated) {
    const url = request.nextUrl.clone();
    url.pathname = '/';

    if (pathname === '/') {
      if (url.searchParams.get('login') !== 'true') {
        url.searchParams.set('login', 'true');
        return addSecurityHeaders(NextResponse.redirect(url));
      }
      return addSecurityHeaders(NextResponse.next());
    }

    url.search = '';
    url.searchParams.set('login', 'true');
    url.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
    return addSecurityHeaders(NextResponse.redirect(url));
  }

  // Redirect logged in users away from auth pages.
  if (pathname.startsWith('/auth')) {
    return addSecurityHeaders(NextResponse.redirect(new URL('/dashboard', request.url)));
  }

  return addSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
