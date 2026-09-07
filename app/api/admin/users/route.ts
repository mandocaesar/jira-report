import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { apiSuccess, apiError, requireDatabase } from '@/lib/api-helpers';
import { getSessionUser, can } from '@/lib/authz';
import { writeAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const GLOBAL_ROLES = ['admin', 'em', 'lead', 'viewer'];

// GET /api/admin/users — users + memberships + squad list (admin only)
export async function GET(request: NextRequest) {
    try {
        const dbErr = requireDatabase(); if (dbErr) return dbErr;
        const user = await getSessionUser(request);
        if (!user) return apiError('Not authenticated', 401);
        if (!can(user, 'admin_settings')) return apiError('User management is admin-only', 403);

        const [users, teams] = await Promise.all([
            prisma!.user.findMany({
                orderBy: { createdAt: 'asc' },
                select: {
                    id: true, email: true, name: true, role: true, isActive: true, createdAt: true,
                    memberships: { select: { teamId: true, role: true } },
                },
            }),
            prisma!.team.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
        ]);

        return apiSuccess({ users, teams, selfId: user.id });
    } catch (error) {
        console.error('Error listing users:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to list users', 500);
    }
}

// POST /api/admin/users — create a user (admin only)
export async function POST(request: NextRequest) {
    try {
        const dbErr = requireDatabase(); if (dbErr) return dbErr;
        const user = await getSessionUser(request);
        if (!user) return apiError('Not authenticated', 401);
        if (!can(user, 'admin_settings')) return apiError('User management is admin-only', 403);

        const { email, name, password, role } = await request.json();
        if (!email || !name || !password) return apiError('email, name and password are required', 400);
        if (password.length < 8) return apiError('Password must be at least 8 characters', 400);
        if (role && !GLOBAL_ROLES.includes(role)) return apiError('Invalid role', 400);

        const created = await prisma!.user.create({
            data: {
                email: String(email).toLowerCase().trim(),
                name: String(name).trim(),
                passwordHash: await bcrypt.hash(password, 10),
                role: role ?? 'viewer',
            },
            select: { id: true, email: true, name: true, role: true, isActive: true },
        });

        await writeAudit(prisma!, user, {
            action: 'user.create', entity: 'User', entityId: created.id,
            after: { email: created.email, name: created.name, role: created.role },
        });

        return apiSuccess({ user: created });
    } catch (error) {
        console.error('Error creating user:', error);
        const msg = error instanceof Error ? error.message : 'Failed to create user';
        return apiError(msg.includes('Unique constraint') ? 'A user with that email already exists' : msg,
            msg.includes('Unique constraint') ? 409 : 500);
    }
}
