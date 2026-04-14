import { NextRequest, NextResponse } from 'next/server';
import { createJiraClient } from '@/lib/jira-client';
import { calculateEpicBreakdowns } from '@/lib/epic-breakdown-calculator';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const boardId = searchParams.get('boardId');
        const sprintId = searchParams.get('sprintId');

        if (!boardId || !sprintId) {
            return NextResponse.json(
                { error: 'boardId and sprintId are required' },
                { status: 400 }
            );
        }

        const client = createJiraClient();

        const [epics, issues] = await Promise.all([
            client.getEpics(parseInt(boardId, 10)),
            client.getSprintIssues(parseInt(sprintId, 10), parseInt(boardId, 10))
        ]);

        const result = calculateEpicBreakdowns(epics, issues);

        return NextResponse.json({ epicBreakdowns: result });
    } catch (error) {
        console.error('Error fetching epic breakdown:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
