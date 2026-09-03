import { NextRequest } from 'next/server';
import { apiSuccess, apiError } from '@/lib/api-helpers';
import { createJiraClient } from '@/lib/jira-client';
import { loadSprintCapacity } from '@/lib/capacity-engine';
import { getSessionUser, can } from '@/lib/authz';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET /api/plan?boardId&sprintId — member capacity table for the Plan tab
export async function GET(request: NextRequest) {
    try {
        const url = new URL(request.url);
        const boardId = parseInt(url.searchParams.get('boardId') || '');
        const sprintId = parseInt(url.searchParams.get('sprintId') || '');
        if (isNaN(boardId) || isNaN(sprintId)) {
            return apiError('boardId and sprintId are required', 400);
        }

        const sprint = await createJiraClient().getSprint(sprintId);
        const loaded = await loadSprintCapacity(sprint, { boardId });
        if (!loaded) {
            return apiError('Squad is not registered in the database — Plan needs the capacity engine', 404);
        }

        const user = await getSessionUser(request);
        const canEdit = can(user, 'edit_leave', loaded.teamId);

        return apiSuccess({
            sprint: { id: sprint.id, name: sprint.name, state: sprint.state, startDate: sprint.startDate, endDate: sprint.endDate },
            teamId: loaded.teamId,
            sprintWorkingDays: loaded.capacity.sprintWorkingDays,
            holidayCount: loaded.input.holidayDates.size,
            nonDevCount: loaded.input.nonDevDates.size,
            teamTheoreticalMandays: loaded.capacity.teamTheoreticalMandays,
            members: loaded.capacity.members.map(m => ({
                accountId: m.accountId,
                name: m.name,
                role: m.role,
                excluded: m.excluded,
                leaveDays: m.leaveDays,
                allocationFactor: m.allocationFactor,
                theoreticalMandays: m.theoreticalMandays,
            })),
            canEdit,
        });
    } catch (error) {
        console.error('Error in plan API:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to load plan', 500);
    }
}
