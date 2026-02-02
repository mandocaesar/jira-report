import { NextRequest, NextResponse } from 'next/server';
import { createJiraClient } from '@/lib/jira-client';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const boardId = searchParams.get('boardId');

        if (!boardId) {
            return NextResponse.json(
                { error: 'boardId is required' },
                { status: 400 }
            );
        }

        const client = createJiraClient();
        const epics = await client.getEpics(parseInt(boardId, 10));

        return NextResponse.json({ epics });
    } catch (error) {
        console.error('Error fetching epics:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
