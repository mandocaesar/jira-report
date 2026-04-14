import { createJiraClient } from '@/lib/jira-client';
import { calculateMetrics } from '@/lib/metrics-calculator';
import { apiSuccess, apiError } from '@/lib/api-helpers';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const boardId = searchParams.get('boardId');
        const sprintId = searchParams.get('sprintId');

        if (!sprintId) {
            return apiError('Missing sprintId parameter', 400);
        }

        const client = createJiraClient();

        // Fetch sprint info and issues with changelog
        const [sprint, issues] = await Promise.all([
            client.getSprint(parseInt(sprintId, 10)),
            client.getSprintIssuesWithChangelog(
                parseInt(sprintId, 10),
                boardId ? parseInt(boardId, 10) : undefined
            ),
        ]);

        const metrics = calculateMetrics(sprint, issues);

        return apiSuccess(metrics);
    } catch (error) {
        console.error('Error fetching metrics:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to fetch metrics');
    }
}
