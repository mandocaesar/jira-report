import { createJiraClient } from '@/lib/jira-client';
import { apiSuccess, apiError } from '@/lib/api-helpers';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const boardId = searchParams.get('boardId');

        const jiraClient = createJiraClient();
        const sprints = await jiraClient.getSprints(
            boardId ? parseInt(boardId, 10) : undefined
        );

        return apiSuccess(sprints);
    } catch (error) {
        console.error('Error fetching sprints:', error);

        return apiError(
            error instanceof Error ? error.message : 'Failed to fetch sprints'
        );
    }
}
