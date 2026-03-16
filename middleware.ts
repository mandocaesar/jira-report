import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

if (!process.env.AUTH_SECRET) {
    throw new Error('AUTH_SECRET environment variable is required');
}
const AUTH_SECRET = new TextEncoder().encode(process.env.AUTH_SECRET);

// Routes that don't require authentication
const publicRoutes = ['/login', '/api/auth/login', '/api/cron'];

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Allow public routes
    if (publicRoutes.some(route => pathname.startsWith(route))) {
        return NextResponse.next();
    }

    // Allow static files and Next.js internals
    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/favicon') ||
        pathname.includes('.')
    ) {
        return NextResponse.next();
    }

    // Check for auth token
    const token = request.cookies.get('auth-token')?.value;

    if (!token) {
        // Redirect to login if no token
        const loginUrl = new URL('/login', request.url);
        return NextResponse.redirect(loginUrl);
    }

    try {
        // Verify JWT token
        await jwtVerify(token, AUTH_SECRET);
        return NextResponse.next();
    } catch {
        // Invalid token, redirect to login
        const loginUrl = new URL('/login', request.url);
        const response = NextResponse.redirect(loginUrl);
        response.cookies.delete('auth-token');
        return response;
    }
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};
