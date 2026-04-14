import { createJiraClient } from '@/lib/jira-client';
import { calculateMetrics } from '@/lib/metrics-calculator';
import { BoardMetricsData, MetricsData } from '@/types';
import { apiSuccess, apiError } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const boardId = searchParams.get('boardId');
        const yearParam = searchParams.get('year') || '2026'; // Default to 2026 as requested

        if (!boardId) {
            return apiError('Missing boardId parameter', 400);
        }

        const year = parseInt(yearParam, 10);
        const bId = parseInt(boardId, 10);
        const client = createJiraClient();

        // 1. Fetch all sprints for the board
        const allSprints = await client.getSprints(bId);

        // 2. Filter sprints that started in the requested year
        // Make sure to handle potential missing startDates
        const yearSprints = allSprints.filter(sprint => {
            if (!sprint.startDate) return false;
            const sprintYear = new Date(sprint.startDate).getFullYear();
            // Optional: Filter out 'future' state sprints if they haven't happened yet
            return sprintYear === year && sprint.state !== 'future';
        });

        // 3. To avoid overwhelming Jira API rate limits, fetch issues in small batches
        // We'll process them sequentially or in small parallel chunks. Let's do parallel 3 at a time.
        const sprintMetricsData: MetricsData[] = [];

        const chunkSize = 3;
        for (let i = 0; i < yearSprints.length; i += chunkSize) {
            const chunk = yearSprints.slice(i, i + chunkSize);

            const chunkPromises = chunk.map(async (sprint) => {
                try {
                    const issues = await client.getSprintIssuesWithChangelog(sprint.id, bId);
                    return calculateMetrics(sprint, issues);
                } catch (err) {
                    console.error(`Failed to calculate metrics for sprint ${sprint.id}:`, err);
                    return null;
                }
            });

            const results = (await Promise.all(chunkPromises)).filter(Boolean) as MetricsData[];
            sprintMetricsData.push(...results);
        }

        // 4. Sort metrics chronologically by sprint start date
        sprintMetricsData.sort((a, b) => {
            const dateA = new Date(a.sprint.startDate).getTime();
            const dateB = new Date(b.sprint.startDate).getTime();
            return dateA - dateB;
        });

        const responseData: BoardMetricsData = {
            boardId: bId,
            year,
            sprintMetrics: sprintMetricsData,
        };

        return apiSuccess(responseData);

    } catch (error) {
        console.error('Error fetching board metrics:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to fetch board metrics');
    }
}
