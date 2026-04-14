import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SignJWT } from 'jose';
import { apiError } from '@/lib/api-helpers';

if (!process.env.AUTH_PASSWORD) {
    throw new Error('AUTH_PASSWORD environment variable is required');
}
if (!process.env.AUTH_SECRET) {
    throw new Error('AUTH_SECRET environment variable is required');
}
const AUTH_PASSWORD = process.env.AUTH_PASSWORD;
const AUTH_SECRET = new TextEncoder().encode(process.env.AUTH_SECRET);

// Simple in-memory rate limiter: max 5 failed attempts per IP per 15 minutes
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;
const failedAttempts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const record = failedAttempts.get(ip);
    if (!record || now > record.resetAt) return false;
    return record.count >= MAX_ATTEMPTS;
}

function recordFailedAttempt(ip: string): void {
    const now = Date.now();
    const record = failedAttempts.get(ip);
    if (!record || now > record.resetAt) {
        failedAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    } else {
        record.count++;
    }
}

export async function POST(request: NextRequest) {
    try {
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                   request.headers.get('x-real-ip') ||
                   'unknown';

        if (isRateLimited(ip)) {
            return apiError('Too many login attempts. Please try again later.', 429);
        }

        const { password } = await request.json();

        if (password !== AUTH_PASSWORD) {
            recordFailedAttempt(ip);
            return apiError('Invalid password', 401);
        }

        // Create JWT token
        const token = await new SignJWT({ authenticated: true })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('7d') // Token valid for 7 days
            .sign(AUTH_SECRET);

        // Set cookie
        const cookieStore = await cookies();
        cookieStore.set('auth-token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7, // 7 days
            path: '/',
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Login error:', error);
        return apiError('Authentication failed', 500);
    }
}
