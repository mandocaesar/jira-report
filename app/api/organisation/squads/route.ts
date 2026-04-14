import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { apiSuccess, apiError, requireDatabase } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

// GET /api/organisation/squads — list all squads with hierarchy & member counts
export async function GET(request: NextRequest) {
    try {
        const dbErr = requireDatabase(); if (dbErr) return dbErr;

        const url = new URL(request.url);
        const search = url.searchParams.get('search') || '';
        const departmentId = url.searchParams.get('departmentId') || '';
        const divisionId = url.searchParams.get('divisionId') || '';
        const groupId = url.searchParams.get('groupId') || '';
        const activeOnly = url.searchParams.get('activeOnly') !== 'false';

        const where: Record<string, unknown> = {};
        if (activeOnly) where.isActive = true;
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (departmentId) where.departmentId = departmentId;
        if (divisionId) where.department = { divisionId };
        if (groupId) where.department = { division: { groupId } };

        const teams = await prisma!.team.findMany({
            where,
            include: {
                _count: { select: { members: true, dataSources: true, capacityAllocations: true } },
                members: { select: { id: true, role: true } },
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
            },
            orderBy: { name: 'asc' },
        });

        const data = teams.map((team) => ({
            id: team.id,
            name: team.name,
            code: team.code,
            boardId: team.boardId,
            isActive: team.isActive,
            workingHoursPerDay: team.workingHoursPerDay,
            memberCount: team._count.members,
            engineerCount: team.members.filter((m) => m.role === 'engineer').length,
            qaCount: team.members.filter((m) => m.role === 'qa').length,
            dataSourceCount: team._count.dataSources,
            department: team.department
                ? {
                      id: team.department.id,
                      name: team.department.name,
                      division: {
                          id: team.department.division.id,
                          name: team.department.division.name,
                          group: team.department.division.group,
                      },
                  }
                : null,
        }));

        return apiSuccess(data);
    } catch (error) {
        console.error('Error fetching squads:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to fetch squads', 500);
    }
}
