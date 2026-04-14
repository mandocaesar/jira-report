import { NextResponse } from 'next/server';
import { isDatabaseAvailable } from './db';

/**
 * Standard success response wrapper.
 */
export function apiSuccess<T>(data: T, pagination?: { page: number; pageSize: number; total: number }) {
  if (pagination) {
    return NextResponse.json({ success: true, data, pagination });
  }
  return NextResponse.json({ success: true, data });
}

/**
 * Standard error response wrapper.
 */
export function apiError(message: string, status: number = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

/**
 * Guard that checks database availability. Returns an error response if unavailable, or null if OK.
 */
export function requireDatabase(): NextResponse | null {
  if (!isDatabaseAvailable()) {
    return apiError('Database not configured. Please set POSTGRES_PRISMA_URL in .env.local', 503);
  }
  return null;
}

/**
 * Validate that required search params are present. Returns missing keys or null if all present.
 */
export function validateParams(
  searchParams: URLSearchParams,
  requiredKeys: string[]
): string[] | null {
  const missing = requiredKeys.filter(key => !searchParams.get(key));
  return missing.length > 0 ? missing : null;
}
