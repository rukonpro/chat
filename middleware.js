import { NextResponse } from 'next/server';
import { corsHeaders, optionsCorsHeaders, corsMiddleware } from './lib/cors';

/**
 * Next.js Middleware for handling CORS and other global concerns
 * 
 * This middleware runs before any route handlers and can modify the request/response
 * https://nextjs.org/docs/app/building-your-application/routing/middleware
 */
export function middleware(request) {
  // Only apply to API routes
  if (request.nextUrl.pathname.startsWith('/api')) {
    // Handle OPTIONS requests for CORS preflight
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 204,
        headers: optionsCorsHeaders,
      });
    }

    // For other methods, continue to the route handler
    const response = NextResponse.next();

    // Add CORS headers to the response
    return corsMiddleware(response);
  }

  // For non-API routes, just continue
  return NextResponse.next();
}

/**
 * Configure which paths this middleware will run on
 * https://nextjs.org/docs/app/building-your-application/routing/middleware#matcher
 */
export const config = {
  matcher: [
    // Match all API routes
    '/api/:path*',
  ],
};
