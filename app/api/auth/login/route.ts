import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SignJWT } from 'jose';
import bcrypt from 'bcryptjs';
import { apiError } from '@/lib/api-helpers';
import { prisma, isDatabaseAvailable } from '@/lib/db';

if (!process.env.AUTH_PASSWORD) {
    throw new Error('AUTH_PASSWORD environment variable is required');
}
if (!process.env.AUTH_SECRET) {
    throw new Error('AUTH_SECRET environment variable is required');
}
const AUTH_PASSWORD = process.env.AUTH_PASSWORD;
const AUTH_SECRET = new TextEncoder().encode(process.env.AUTH_SECRET);
const BOOTSTRAP_ADMIN_EMAIL = 'armand.caesar@gmail.com';

// Simple in-memory rate limiter: max 5 failed attempts per IP per 15 minutes
const RATE_LIMIT_WINDOW = 15 * 60 * 1000;
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

async function issueSession(payload: { sub?: string; name?: string; role?: string }) {
    const token = await new SignJWT({ authenticated: true, ...payload })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('7d')
        .sign(AUTH_SECRET);
    const cookieStore = await cookies();
    cookieStore.set('auth-token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
    });
}

export async function POST(request: NextRequest) {
    try {
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                   request.headers.get('x-real-ip') ||
                   'unknown';

        if (isRateLimited(ip)) {
            return apiError('Too many login attempts. Please try again later.', 429);
        }

        const { email, password } = await request.json() as { email?: string; password?: string };
        if (!password) {
            recordFailedAttempt(ip);
            return apiError('Password is required', 400);
        }

        // ── User login (email + password) ──
        if (email) {
            if (!isDatabaseAvailable() || !prisma) {
                return apiError('User login requires the database; use the legacy password meanwhile', 503);
            }
            const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
            if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
                recordFailedAttempt(ip);
                return apiError('Invalid email or password', 401);
            }
            await issueSession({ sub: user.id, name: user.name, role: user.role });
            return NextResponse.json({ success: true, user: { name: user.name, role: user.role } });
        }

        // ── Legacy shared-password login (bootstrap path) ──
        if (password !== AUTH_PASSWORD) {
            recordFailedAttempt(ip);
            return apiError('Invalid password', 401);
        }

        // First legacy login after the identity migration creates the admin
        // account with the shared password as its initial password.
        if (isDatabaseAvailable() && prisma) {
            let admin = await prisma.user.findUnique({ where: { email: BOOTSTRAP_ADMIN_EMAIL } });
            if (!admin) {
                admin = await prisma.user.create({
                    data: {
                        email: BOOTSTRAP_ADMIN_EMAIL,
                        name: 'Armanda Caesario Cornelis',
                        passwordHash: await bcrypt.hash(AUTH_PASSWORD, 10),
                        role: 'admin',
                    },
                });
            }
            await issueSession({ sub: admin.id, name: admin.name, role: admin.role });
            return NextResponse.json({ success: true, user: { name: admin.name, role: admin.role } });
        }

        // DB-less: plain legacy token (resolves to synthetic admin)
        await issueSession({});
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Login error:', error);
        return apiError('Authentication failed', 500);
    }
}
