// Authorization for Phase 2 identity. `can` is pure (unit-tested); session
// resolution reads the JWT the login route issues.

import { jwtVerify } from 'jose';
import { NextRequest } from 'next/server';
import { prisma, isDatabaseAvailable } from './db';

export type GlobalRole = 'admin' | 'em' | 'lead' | 'viewer';
export type SquadRole = 'em' | 'lead' | 'viewer';

export interface SessionUser {
    id: string;
    name: string;
    email: string;
    role: GlobalRole;
    /** teamId → squad role */
    memberships: Record<string, SquadRole>;
    /** true for tokens from the legacy shared-password flow before a User row exists */
    legacy?: boolean;
}

export type Action =
    | 'edit_report'    // A1 report rows (PIC, highlights, reasons)
    | 'edit_leave'     // leave day counts, non-dev days
    | 'manage_roster'  // roles, exclusion flags, squad sync
    | 'admin_settings' // Jira conn, holidays, labels, users
    | 'view_audit';

/** Pure permission check. `teamId` scopes squad-level actions. */
export function can(user: SessionUser | null, action: Action, teamId?: string): boolean {
    if (!user) return false;
    if (user.role === 'admin') return true;

    const squadRole: SquadRole | undefined = teamId ? user.memberships[teamId] : undefined;
    switch (action) {
        case 'edit_report':
        case 'edit_leave':
            return squadRole === 'em' || squadRole === 'lead';
        case 'manage_roster':
            return squadRole === 'em';
        case 'admin_settings':
        case 'view_audit':
            return false; // admin-only, handled above
        default:
            return false;
    }
}

const AUTH_SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || '');

/**
 * Resolve the session user from the auth cookie. Returns null when the token
 * is missing/invalid. Legacy shared-password tokens (no `sub`) resolve to a
 * synthetic admin so pre-migration sessions keep working.
 */
export async function getSessionUser(request: NextRequest): Promise<SessionUser | null> {
    const token = request.cookies.get('auth-token')?.value;
    if (!token) return null;

    let payload: { sub?: string; name?: string; role?: string };
    try {
        payload = (await jwtVerify(token, AUTH_SECRET)).payload as typeof payload;
    } catch {
        return null;
    }

    if (!payload.sub) {
        // Legacy token from the shared-password flow
        return { id: 'legacy', name: 'Legacy admin', email: '', role: 'admin', memberships: {}, legacy: true };
    }

    if (!isDatabaseAvailable() || !prisma) {
        // DB down: trust token claims, no memberships
        return {
            id: payload.sub,
            name: payload.name ?? 'Unknown',
            email: '',
            role: (payload.role as GlobalRole) ?? 'viewer',
            memberships: {},
        };
    }

    const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        include: { memberships: true },
    });
    if (!user || !user.isActive) return null;

    const memberships: Record<string, SquadRole> = {};
    for (const m of user.memberships) memberships[m.teamId] = m.role as SquadRole;

    return { id: user.id, name: user.name, email: user.email, role: user.role as GlobalRole, memberships };
}
