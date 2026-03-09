import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;

    // Let the setup page and QB API routes through without QB checks
    if (pathname.startsWith('/setup') || pathname.startsWith('/api/')) {
      return NextResponse.next();
    }

    // For dashboard routes: the setup page handles QB connection state client-side.
    // We don't check QB tokens in middleware (no filesystem access here) — instead
    // the dashboard page redirects to /setup if QB is not connected.
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: ['/dashboard/:path*', '/setup/:path*'],
};
