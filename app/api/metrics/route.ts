import { NextResponse } from 'next/server';
import { createJiraClient } from '@/lib/jira-client';
import { calculateMetrics } from '@/lib/metrics-calculator';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const boardId = searchParams.get('boardId');
        const sprintId = searchParams.get('sprintId');

        if (!sprintId) {
            return NextResponse.json(
                { success: false, error: 'Missing sprintId parameter' },
                { status: 400 }
            );
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

        return NextResponse.json({
            success: true,
            data: metrics,
        });
    } catch (error) {
        console.error('Error fetching metrics:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Failed to fetch metrics' },
            { status: 500 }
        );
    }
}
