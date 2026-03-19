import { NextRequest, NextResponse } from 'next/server';
import { prisma, isDatabaseAvailable } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/organisation/squads/[id] — full squad detail from DB
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        if (!isDatabaseAvailable() || !prisma) {
            return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 });
        }

        const team = await prisma.team.findUnique({
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
            return NextResponse.json({ success: false, error: 'Squad not found' }, { status: 404 });
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

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('Error fetching squad detail:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Failed to fetch squad detail' },
            { status: 500 }
        );
    }
}

// PATCH /api/organisation/squads/[id] — update squad fields
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        if (!isDatabaseAvailable() || !prisma) {
            return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 });
        }

        const body = await request.json();
        const allowedFields: Record<string, unknown> = {};

        if (body.workingHoursPerDay !== undefined) {
            const hours = parseFloat(body.workingHoursPerDay);
            if (isNaN(hours) || hours <= 0 || hours > 24) {
                return NextResponse.json({ success: false, error: 'Working hours must be between 0 and 24' }, { status: 400 });
            }
            allowedFields.workingHoursPerDay = hours;
        }
        if (body.name !== undefined) allowedFields.name = body.name;
        if (body.code !== undefined) allowedFields.code = body.code || null;
        if (body.isActive !== undefined) allowedFields.isActive = body.isActive;
        if (body.reportEmailGroup !== undefined) allowedFields.reportEmailGroup = body.reportEmailGroup || null;

        if (Object.keys(allowedFields).length === 0) {
            return NextResponse.json({ success: false, error: 'No valid fields to update' }, { status: 400 });
        }

        const updated = await prisma.team.update({
            where: { id },
            data: allowedFields,
        });

        return NextResponse.json({ success: true, data: updated });
    } catch (error) {
        console.error('Error updating squad:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Failed to update squad' },
            { status: 500 }
        );
    }
}
