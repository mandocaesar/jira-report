import { NextRequest } from 'next/server';
import { createJiraClient } from '@/lib/jira-client';
import { apiSuccess, apiError } from '@/lib/api-helpers';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const boardId = searchParams.get('boardId');

        if (!boardId) {
            return apiError('boardId is required', 400);
        }

        const client = createJiraClient();
        const epics = await client.getEpics(parseInt(boardId, 10));

        return apiSuccess(epics);
    } catch (error) {
        console.error('Error fetching epics:', error);
        return apiError(
            error instanceof Error ? error.message : 'Unknown error'
        );
    }
}
