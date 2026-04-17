import { createJiraClient } from '@/lib/jira-client';
import { calculateSprintUtilization } from '@/lib/utilization-calculator';
import { calculateSprintReport } from '@/lib/sprint-report-calculator';
import { apiSuccess, apiError } from '@/lib/api-helpers';
import { apiCache } from '@/lib/cache';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const sprintId = parseInt(id, 10);

        if (isNaN(sprintId)) {
            return apiError('Invalid sprint ID', 400);
        }

        // Get optional boardId for team filtering
        const { searchParams } = new URL(request.url);
        const boardId = searchParams.get('boardId');
        const refresh = searchParams.get('refresh') === 'true';

        // Bust server-side cache when user explicitly refreshes
        if (refresh) {
            apiCache.invalidatePrefix(`sprintIssues:${sprintId}:`);
            apiCache.delete(`sprints:${boardId}`);
        }

        const jiraClient = createJiraClient();

        // Fetch sprint details and issues in parallel
        const [sprint, issues] = await Promise.all([
            jiraClient.getSprint(sprintId),
            jiraClient.getSprintIssuesWithChangelog(sprintId, boardId ? parseInt(boardId, 10) : undefined),
        ]);

        // Calculate utilization and sprint report in parallel
        const [utilization, sprintReport] = await Promise.all([
            calculateSprintUtilization(sprint, issues, boardId ? parseInt(boardId, 10) : undefined),
            calculateSprintReport(sprint, issues, boardId ? parseInt(boardId, 10) : undefined),
        ]);

        return apiSuccess(utilization, {
            extra: { report: sprintReport, jiraDomain: process.env.JIRA_DOMAIN || '' },
        });
    } catch (error) {
        console.error('Error fetching sprint details:', error);

        return apiError(
            error instanceof Error ? error.message : 'Failed to fetch sprint details'
        );
    }
}

