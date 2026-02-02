import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SignJWT } from 'jose';

const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'changeme123';
const AUTH_SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || 'default-secret-change-me');

export async function POST(request: NextRequest) {
    try {
        const { password } = await request.json();

        if (password !== AUTH_PASSWORD) {
            return NextResponse.json(
                { error: 'Invalid password' },
                { status: 401 }
            );
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
        return NextResponse.json(
            { error: 'Authentication failed' },
            { status: 500 }
        );
    }
}
