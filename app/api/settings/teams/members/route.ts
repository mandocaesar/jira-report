import { prisma } from '@/lib/db';
import { apiSuccess, apiError, requireDatabase } from '@/lib/api-helpers';

// POST /api/settings/teams/members — add a member to a team
export async function POST(request: Request) {
    try {
        const dbErr = requireDatabase();
        if (dbErr) return dbErr;

        const { teamId, accountId, name, email, role, title, workingHoursPerDay } = await request.json();

        if (!teamId || !accountId || !name || !email) {
            return apiError('teamId, accountId, name, and email are required', 400);
        }

        const member = await prisma!.teamMember.create({
            data: {
                teamId,
                accountId,
                name,
                email,
                role: role || 'engineer',
                title: title || 'Associate',
                ...(workingHoursPerDay !== undefined && workingHoursPerDay !== null && { workingHoursPerDay: parseFloat(workingHoursPerDay) }),
            },
        });

        return apiSuccess(member);
    } catch (error) {
        console.error('Error adding member:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to add member');
    }
}

// PUT /api/settings/teams/members — update a member
export async function PUT(request: Request) {
    try {
        const dbErr = requireDatabase();
        if (dbErr) return dbErr;

        const { id, name, email, role, title, workingHoursPerDay } = await request.json();

        if (!id) {
            return apiError('id is required', 400);
        }

        const member = await prisma!.teamMember.update({
            where: { id },
            data: {
                ...(name !== undefined && { name }),
                ...(email !== undefined && { email }),
                ...(role !== undefined && { role }),
                ...(title !== undefined && { title }),
                ...(workingHoursPerDay !== undefined && { workingHoursPerDay: workingHoursPerDay === null ? null : parseFloat(workingHoursPerDay) }),
            },
        });

        return apiSuccess(member);
    } catch (error) {
        console.error('Error updating member:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to update member');
    }
}

// DELETE /api/settings/teams/members — remove a member
export async function DELETE(request: Request) {
    try {
        const dbErr = requireDatabase();
        if (dbErr) return dbErr;

        const { id } = await request.json();

        if (!id) {
            return apiError('id is required', 400);
        }

        await prisma!.teamMember.delete({ where: { id } });

        return apiSuccess({ message: 'Member removed' });
    } catch (error) {
        console.error('Error removing member:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to remove member');
    }
}
