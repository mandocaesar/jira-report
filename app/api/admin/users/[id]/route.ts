import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { apiSuccess, apiError, requireDatabase } from '@/lib/api-helpers';
import { getSessionUser, can } from '@/lib/authz';
import { writeAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const GLOBAL_ROLES = ['admin', 'em', 'lead', 'viewer'];
const SQUAD_ROLES = ['em', 'lead', 'viewer'];

// PATCH /api/admin/users/[id] — update role/active/password/memberships (admin only)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const dbErr = requireDatabase(); if (dbErr) return dbErr;
        const user = await getSessionUser(request);
        if (!user) return apiError('Not authenticated', 401);
        if (!can(user, 'admin_settings')) return apiError('User management is admin-only', 403);

        const { id } = await params;
        const body = await request.json() as {
            role?: string;
            isActive?: boolean;
            password?: string;
            memberships?: Array<{ teamId: string; role: string }>;
        };

        const target = await prisma!.user.findUnique({ where: { id }, include: { memberships: true } });
        if (!target) return apiError('User not found', 404);

        // Self-lockout protection: you cannot demote or deactivate yourself
        if (id === user.id && (body.isActive === false || (body.role && body.role !== 'admin'))) {
            return apiError('You cannot demote or deactivate your own account', 400);
        }
        if (body.role && !GLOBAL_ROLES.includes(body.role)) return apiError('Invalid role', 400);
        if (body.password && body.password.length < 8) return apiError('Password must be at least 8 characters', 400);
        if (body.memberships) {
            for (const m of body.memberships) {
                if (!SQUAD_ROLES.includes(m.role)) return apiError(`Invalid squad role: ${m.role}`, 400);
            }
        }

        const before = {
            role: target.role,
            isActive: target.isActive,
            memberships: target.memberships.map(m => ({ teamId: m.teamId, role: m.role })),
        };

        const updated = await prisma!.$transaction(async tx => {
            if (body.memberships) {
                await tx.squadMembership.deleteMany({ where: { userId: id } });
                if (body.memberships.length > 0) {
                    await tx.squadMembership.createMany({
                        data: body.memberships.map(m => ({ userId: id, teamId: m.teamId, role: m.role })),
                    });
                }
            }
            return tx.user.update({
                where: { id },
                data: {
                    ...(body.role ? { role: body.role } : {}),
                    ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
                    ...(body.password ? { passwordHash: await bcrypt.hash(body.password, 10) } : {}),
                },
                select: {
                    id: true, email: true, name: true, role: true, isActive: true,
                    memberships: { select: { teamId: true, role: true } },
                },
            });
        });

        await writeAudit(prisma!, user, {
            action: 'user.update', entity: 'User', entityId: id,
            before,
            after: {
                role: updated.role,
                isActive: updated.isActive,
                memberships: updated.memberships,
                ...(body.password ? { passwordReset: true } : {}),
            },
        });

        return apiSuccess({ user: updated });
    } catch (error) {
        console.error('Error updating user:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to update user', 500);
    }
}
