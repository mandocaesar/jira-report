import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { apiSuccess, apiError, requireDatabase } from '@/lib/api-helpers';
import { getSessionUser, can } from '@/lib/authz';

export const dynamic = 'force-dynamic';

// GET /api/admin/audit?user=&entity=&teamId=&limit= — admin-only audit trail
export async function GET(request: NextRequest) {
    try {
        const dbErr = requireDatabase(); if (dbErr) return dbErr;

        const user = await getSessionUser(request);
        if (!user) return apiError('Not authenticated', 401);
        if (!can(user, 'view_audit')) return apiError('Audit log is admin-only', 403);

        const url = new URL(request.url);
        const entity = url.searchParams.get('entity');
        const userName = url.searchParams.get('user');
        const teamId = url.searchParams.get('teamId');
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);

        const rows = await prisma!.auditLog.findMany({
            where: {
                ...(entity ? { entity } : {}),
                ...(userName ? { userName: { contains: userName, mode: 'insensitive' } } : {}),
                ...(teamId ? { teamId } : {}),
            },
            orderBy: { at: 'desc' },
            take: limit,
        });

        return apiSuccess({ rows });
    } catch (error) {
        console.error('Error reading audit log:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to read audit log', 500);
    }
}
