import { NextResponse } from 'next/server';
import { createJiraClient } from '@/lib/jira-client';

export async function GET() {
    try {
        const jiraClient = createJiraClient();
        const boards = await jiraClient.getBoards();

        return NextResponse.json({
            success: true,
            data: boards.values || []
        });
    } catch (error) {
        console.error('Error fetching boards:', error);

        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to fetch boards'
            },
            { status: 500 }
        );
    }
}
