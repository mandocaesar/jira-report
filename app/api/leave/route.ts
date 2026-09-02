import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { apiSuccess, apiError, requireDatabase } from '@/lib/api-helpers';
import { getSessionUser, can } from '@/lib/authz';
import { writeAudit } from '@/lib/audit';

// GET /api/leave?sprintId=123
export async function GET(request: Request) {
    try {
        const dbErr = requireDatabase();
        if (dbErr) return dbErr;

        const { searchParams } = new URL(request.url);
        const sprintIdParam = searchParams.get('sprintId');

        if (!sprintIdParam) {
            return apiError('sprintId is required', 400);
        }

        const sprintId = parseInt(sprintIdParam);

        const leaveEntries = await prisma!.sprintLeave.findMany({
            where: { sprintId },
        });

        // Convert to a map for easier frontend consumption
        const leaveMap: Record<string, number> = {};
        leaveEntries.forEach((entry: { accountId: string; leaveDays: number }) => {
            leaveMap[entry.accountId] = entry.leaveDays;
        });

        return apiSuccess(leaveMap);
    } catch (error) {
        console.error('Error fetching sprint leave:', error);
        return apiError(
            error instanceof Error ? error.message : 'Failed to fetch sprint leave'
        );
    }
}

// PUT /api/leave
export async function PUT(request: NextRequest) {
    try {
        const dbErr = requireDatabase();
        if (dbErr) return dbErr;

        const body = await request.json();
        const { sprintId, leaveData, boardId } = body;

        if (!sprintId || !leaveData) {
            return apiError('sprintId and leaveData are required', 400);
        }

        // ── ACL: leave edits need edit_leave on the squad (or admin) ──
        const user = await getSessionUser(request);
        if (!user) return apiError('Not authenticated', 401);
        let teamId: string | null = null;
        if (boardId) {
            const team = await prisma!.team.findUnique({ where: { boardId: parseInt(boardId) }, select: { id: true } });
            teamId = team?.id ?? null;
        }
        if (!can(user, 'edit_leave', teamId ?? undefined)) {
            return apiError('You do not have permission to edit leave for this squad', 403);
        }

        // leaveData is a map: { accountId: leaveDays, ... }
        // leaveDays >= -1 only: -1 is the legacy "exclude this member from the
        // sprint" sentinel (see lib/capacity-engine.ts loadSprintCapacity); anything
        // more negative than that has no defined meaning and would silently corrupt
        // capacity math downstream.
        for (const [accountId, leaveDays] of Object.entries(leaveData as Record<string, number>)) {
            const parsed = parseInt(leaveDays as any);
            if (Number.isNaN(parsed) || parsed < -1) {
                return apiError(`Invalid leaveDays for ${accountId}: must be an integer >= -1`, 400);
            }
        }

        const updates = Object.entries(leaveData as Record<string, number>).map(
            ([accountId, leaveDays]) => ({
                sprintId: parseInt(sprintId),
                accountId,
                leaveDays: parseInt(leaveDays as any),
            })
        );

        // Snapshot current values for the audit diff
        const existing = await prisma!.sprintLeave.findMany({ where: { sprintId: parseInt(sprintId) } });
        const beforeMap: Record<string, number> = {};
        for (const e of existing) beforeMap[e.accountId] = e.leaveDays;

        // Upsert all leave entries in a transaction
        const db = prisma!;
        await db.$transaction(
            updates.map((data) =>
                db.sprintLeave.upsert({
                    where: {
                        sprintId_accountId: {
                            sprintId: data.sprintId,
                            accountId: data.accountId,
                        },
                    },
                    update: {
                        leaveDays: data.leaveDays,
                    },
                    create: data,
                })
            )
        );

        await writeAudit(db, user, {
            action: 'leave.set',
            entity: 'SprintLeave',
            entityId: String(sprintId),
            teamId,
            before: beforeMap,
            after: leaveData,
        });

        return apiSuccess({ message: 'Leave data saved successfully' });
    } catch (error) {
        console.error('Error saving sprint leave:', error);
        return apiError(
            error instanceof Error ? error.message : 'Failed to save sprint leave'
        );
    }
}
