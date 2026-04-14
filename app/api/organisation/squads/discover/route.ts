import { NextRequest, NextResponse } from 'next/server';
import { prisma, isDatabaseAvailable } from '@/lib/db';
import { createJiraClient } from '@/lib/jira-client';

export const dynamic = 'force-dynamic';

// GET /api/organisation/squads/discover?boardId=X
export async function GET(request: NextRequest) {
    try {
        if (!isDatabaseAvailable() || !prisma) {
            return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 });
        }

        const boardId = Number(request.nextUrl.searchParams.get('boardId'));
        if (!boardId || isNaN(boardId)) {
            return NextResponse.json({ success: false, error: 'boardId is required' }, { status: 400 });
        }

        const jira = createJiraClient();

        // Discover members from Jira board (scans recent sprint assignees)
        const jiraMembers = await jira.discoverBoardMembers(boardId);

        // Check existing team for this board
        const existingTeam = await prisma.team.findUnique({
            where: { boardId },
            include: { members: true },
        });

        const existingAccountIds = new Set(
            existingTeam?.members.map(m => m.accountId) || []
        );

        // Cross-reference: categorize as existing or new
        const existing = jiraMembers
            .filter(m => existingAccountIds.has(m.accountId))
            .map(m => {
                const dbMember = existingTeam!.members.find(dm => dm.accountId === m.accountId)!;
                return {
                    ...m,
                    role: dbMember.role,
                    title: dbMember.title,
                    inDatabase: true,
                };
            });

        const discovered = jiraMembers
            .filter(m => !existingAccountIds.has(m.accountId))
            .map(m => ({
                ...m,
                role: 'engineer' as const,
                title: 'Associate',
                inDatabase: false,
            }));

        // Find members in DB but NOT in Jira (potentially removed)
        const removedFromJira = existingTeam?.members
            .filter(m => !jiraMembers.some(jm => jm.accountId === m.accountId))
            .map(m => ({
                accountId: m.accountId,
                displayName: m.name,
                emailAddress: m.email,
                avatarUrl: '',
                role: m.role,
                title: m.title,
                inDatabase: true,
                notInJira: true,
            })) || [];

        return NextResponse.json({
            success: true,
            data: {
                boardId,
                existingTeamId: existingTeam?.id || null,
                existingTeamName: existingTeam?.name || null,
                existing,
                discovered,
                removedFromJira,
                totalJiraMembers: jiraMembers.length,
            },
        });
    } catch (error) {
        console.error('Error discovering board members:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Failed to discover members' },
            { status: 500 }
        );
    }
}
