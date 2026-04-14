import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { apiSuccess, apiError, requireDatabase } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

// GET /api/organisation/squads/[id] — full squad detail from DB
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const dbErr = requireDatabase(); if (dbErr) return dbErr;

        const team = await prisma!.team.findUnique({
            where: { id },
            include: {
                members: {
                    orderBy: { name: 'asc' },
                    include: {
                        capacityAllocations: {
                            orderBy: { startDate: 'desc' },
                            include: { team: { select: { id: true, name: true } } },
                        },
                        leaves: {
                            orderBy: { startDate: 'desc' },
                            take: 5,
                        },
                    },
                },
                department: {
                    select: {
                        id: true,
                        name: true,
                        division: {
                            select: {
                                id: true,
                                name: true,
                                group: { select: { id: true, name: true } },
                            },
                        },
                    },
                },
                dataSources: {
                    orderBy: { name: 'asc' },
                },
                capacityAllocations: {
                    orderBy: { startDate: 'desc' },
                    include: {
                        teamMember: { select: { id: true, name: true, nik: true, role: true } },
                    },
                },
                nonDevDays: {
                    orderBy: { date: 'desc' },
                    take: 20,
                },
            },
        });

        if (!team) {
            return apiError('Squad not found', 404);
        }

        // Identify leadership roles (members with specific titles)
        const leadershipTitles = ['lead', 'manager', 'head', 'principal', 'staff', 'senior lead', 'tech lead', 'team lead', 'engineering manager'];
        const leadership = team.members
            .filter((m) => {
                const titleLower = m.title.toLowerCase();
                return leadershipTitles.some((lt) => titleLower.includes(lt));
            })
            .map((m) => ({
                id: m.id,
                name: m.name,
                title: m.title,
                role: m.role,
                email: m.email,
            }));

        const data = {
            id: team.id,
            name: team.name,
            code: team.code,
            boardId: team.boardId,
            isActive: team.isActive,
            workingHoursPerDay: team.workingHoursPerDay,
            reportEmailGroup: team.reportEmailGroup,
            department: team.department,
            memberCount: team.members.length,
            engineerCount: team.members.filter((m) => m.role === 'engineer').length,
            qaCount: team.members.filter((m) => m.role === 'qa').length,
            leadership,
            members: team.members.map((m) => ({
                id: m.id,
                accountId: m.accountId,
                name: m.name,
                email: m.email,
                nik: m.nik,
                role: m.role,
                title: m.title,
                gender: m.gender,
                workingHoursPerDay: m.workingHoursPerDay,
                allocations: m.capacityAllocations,
                recentLeaves: m.leaves,
            })),
            dataSources: team.dataSources.map((ds) => ({
                id: ds.id,
                name: ds.name,
                boardId: ds.boardId,
                jqlQuery: ds.jqlQuery,
                isActive: ds.isActive,
                fetchWorklogs: ds.fetchWorklogs,
                lastSyncAt: ds.lastSyncAt,
                lastSyncStatus: ds.lastSyncStatus,
                issueCount: ds.issueCount,
            })),
            allocations: team.capacityAllocations.map((a) => ({
                id: a.id,
                type: a.type,
                teamMemberId: a.teamMemberId,
                memberName: a.teamMember.name,
                memberNik: a.teamMember.nik,
                memberRole: a.teamMember.role,
                sprintId: a.sprintId,
                startDate: a.startDate,
                endDate: a.endDate,
                capacityPercent: a.capacityPercent,
                notes: a.notes,
            })),
            nonDevDays: team.nonDevDays.map((d) => ({
                id: d.id,
                date: d.date,
                sprintId: d.sprintId,
                reason: d.reason,
            })),
        };

        return apiSuccess(data);
    } catch (error) {
        console.error('Error fetching squad detail:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to fetch squad detail', 500);
    }
}

// PATCH /api/organisation/squads/[id] — update squad fields
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const dbErr = requireDatabase(); if (dbErr) return dbErr;

        const body = await request.json();
        const allowedFields: Record<string, unknown> = {};

        if (body.workingHoursPerDay !== undefined) {
            const hours = parseFloat(body.workingHoursPerDay);
            if (isNaN(hours) || hours <= 0 || hours > 24) {
                return apiError('Working hours must be between 0 and 24', 400);
            }
            allowedFields.workingHoursPerDay = hours;
        }
        if (body.name !== undefined) allowedFields.name = body.name;
        if (body.code !== undefined) allowedFields.code = body.code || null;
        if (body.isActive !== undefined) allowedFields.isActive = body.isActive;
        if (body.reportEmailGroup !== undefined) allowedFields.reportEmailGroup = body.reportEmailGroup || null;

        if (Object.keys(allowedFields).length === 0) {
            return apiError('No valid fields to update', 400);
        }

        const updated = await prisma!.team.update({
            where: { id },
            data: allowedFields,
        });

        return apiSuccess(updated);
    } catch (error) {
        console.error('Error updating squad:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to update squad', 500);
    }
}
