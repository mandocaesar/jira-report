import { NextRequest } from 'next/server';
import { createJiraClient } from '@/lib/jira-client';
import { calculateEpicBreakdowns } from '@/lib/epic-breakdown-calculator';
import { apiSuccess, apiError } from '@/lib/api-helpers';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const boardId = searchParams.get('boardId');
        const sprintId = searchParams.get('sprintId');

        if (!boardId || !sprintId) {
            return apiError('boardId and sprintId are required', 400);
        }

        const client = createJiraClient();

        const [epics, issues] = await Promise.all([
            client.getEpics(parseInt(boardId, 10)),
            client.getSprintIssues(parseInt(sprintId, 10), parseInt(boardId, 10))
        ]);

        const result = calculateEpicBreakdowns(epics, issues);

        return apiSuccess(result);
    } catch (error) {
        console.error('Error fetching epic breakdown:', error);
        return apiError(
            error instanceof Error ? error.message : 'Unknown error'
        );
    }
}
