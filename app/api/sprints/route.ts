import { NextResponse } from 'next/server';
import { createJiraClient } from '@/lib/jira-client';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const boardId = searchParams.get('boardId');

        const jiraClient = createJiraClient();
        const sprints = await jiraClient.getSprints(
            boardId ? parseInt(boardId, 10) : undefined
        );

        return NextResponse.json({
            success: true,
            data: sprints
        });
    } catch (error) {
        console.error('Error fetching sprints:', error);

        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to fetch sprints'
            },
            { status: 500 }
        );
    }
}
