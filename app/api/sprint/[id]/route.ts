import { createJiraClient } from '@/lib/jira-client';
import { calculateSprintUtilization } from '@/lib/utilization-calculator';
import { calculateSprintReport } from '@/lib/sprint-report-calculator';
import { apiSuccess, apiError } from '@/lib/api-helpers';
import { apiCache } from '@/lib/cache';
import { getSnapshot, saveSnapshot } from '@/lib/snapshot';
import { NextResponse } from 'next/server';

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
        const boardIdNum = boardId ? parseInt(boardId, 10) : undefined;

        // Closed sprints never change — serve the stored snapshot unless refreshing
        if (!refresh && boardIdNum !== undefined) {
            const snap = await getSnapshot<Record<string, unknown>>(boardIdNum, sprintId, 'check');
            if (snap) {
                return NextResponse.json({ ...snap.payload, snapshotAt: snap.computedAt });
            }
        }

        // Fetch sprint details and issues in parallel
        const [sprint, issues] = await Promise.all([
            jiraClient.getSprint(sprintId),
            jiraClient.getSprintIssuesWithChangelog(sprintId, boardIdNum),
        ]);

        // Calculate utilization and sprint report in parallel
        const [utilization, sprintReport] = await Promise.all([
            calculateSprintUtilization(sprint, issues, boardId ? parseInt(boardId, 10) : undefined),
            calculateSprintReport(sprint, issues, boardId ? parseInt(boardId, 10) : undefined),
        ]);

        const body = {
            success: true,
            data: utilization,
            report: sprintReport,
            jiraDomain: process.env.JIRA_DOMAIN || '',
        };

        if (sprint.state === 'closed' && boardIdNum !== undefined) {
            await saveSnapshot(boardIdNum, sprintId, 'check', body);
        }

        return NextResponse.json(body);
    } catch (error) {
        console.error('Error fetching sprint details:', error);

        return apiError(
            error instanceof Error ? error.message : 'Failed to fetch sprint details'
        );
    }
}

