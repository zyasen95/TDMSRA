import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE_NAME = 'msra_demo_session';

// Routes that require authentication
const protectedRoutes = [
  '/custom-quiz',
  '/MSRAChatbot',
  '/api/generate-msra', // Add any other protected API routes
];

// Routes that are always public
const publicRoutes = [
  '/',
  '/auth',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/check',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (publicRoutes.includes(pathname)) {
    return NextResponse.next();
  }

  // Allow static files and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Check if route needs protection
  const needsAuth = protectedRoutes.some(route => pathname.startsWith(route));

  if (needsAuth) {
    // Check for session cookie
    const sessionToken = request.cookies.get(SESSION_COOKIE_NAME);

    if (!sessionToken) {
      // No session - redirect to auth
      const url = request.nextUrl.clone();
      url.pathname = '/auth';
      // Optionally store the original URL to redirect back after auth
      url.searchParams.set('from', pathname);
      return NextResponse.redirect(url);
    }
  }

  // Allow the request to continue
  return NextResponse.next();
}

// Configure which routes use this middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};