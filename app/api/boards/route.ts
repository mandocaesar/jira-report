import { createJiraClient } from '@/lib/jira-client';
import { apiSuccess, apiError } from '@/lib/api-helpers';

export async function GET() {
    try {
        const jiraClient = createJiraClient();
        const boards = await jiraClient.getBoards();

        return apiSuccess(boards.values || [], {
            headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
        });
    } catch (error) {
        console.error('Error fetching boards:', error);

        return apiError(
            error instanceof Error ? error.message : 'Failed to fetch boards'
        );
    }
}
