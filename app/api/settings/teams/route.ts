import { prisma } from '@/lib/db';
import { apiSuccess, apiError, requireDatabase } from '@/lib/api-helpers';

// GET /api/settings/teams — list all teams with members
export async function GET() {
    try {
        const dbErr = requireDatabase();
        if (dbErr) return dbErr;

        const teams = await prisma!.team.findMany({
            include: { members: { orderBy: { name: 'asc' } } },
            orderBy: { name: 'asc' },
        });

        return apiSuccess(teams);
    } catch (error) {
        console.error('Error fetching teams:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to fetch teams');
    }
}

// POST /api/settings/teams — create a new team
export async function POST(request: Request) {
    try {
        const dbErr = requireDatabase();
        if (dbErr) return dbErr;

        const { name, boardId, departmentId } = await request.json();

        if (!name || boardId === undefined) {
            return apiError('name and boardId are required', 400);
        }

        const team = await prisma!.team.create({
            data: {
                name,
                boardId: parseInt(boardId),
                ...(departmentId && { departmentId }),
            },
        });

        return apiSuccess(team);
    } catch (error) {
        console.error('Error creating team:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to create team');
    }
}

// PUT /api/settings/teams — update a team
export async function PUT(request: Request) {
    try {
        const dbErr = requireDatabase();
        if (dbErr) return dbErr;

        const { id, name, boardId, reportEmailGroup, isSchedulingEnabled, departmentId, workingHoursPerDay } = await request.json();

        if (!id) {
            return apiError('id is required', 400);
        }

        const team = await prisma!.team.update({
            where: { id },
            data: {
                ...(name !== undefined && { name }),
                ...(boardId !== undefined && { boardId: parseInt(boardId) }),
                ...(reportEmailGroup !== undefined && { reportEmailGroup }),
                ...(isSchedulingEnabled !== undefined && { isSchedulingEnabled }),
                ...(departmentId !== undefined && { departmentId }),
                ...(workingHoursPerDay !== undefined && { workingHoursPerDay: parseFloat(workingHoursPerDay) }),
            },
        });

        return apiSuccess(team);
    } catch (error) {
        console.error('Error updating team:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to update team');
    }
}

// DELETE /api/settings/teams — delete a team (cascades to members)
export async function DELETE(request: Request) {
    try {
        const dbErr = requireDatabase();
        if (dbErr) return dbErr;

        const { id } = await request.json();

        if (!id) {
            return apiError('id is required', 400);
        }

        await prisma!.team.delete({ where: { id } });

        return apiSuccess({ message: 'Team deleted' });
    } catch (error) {
        console.error('Error deleting team:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to delete team');
    }
}
