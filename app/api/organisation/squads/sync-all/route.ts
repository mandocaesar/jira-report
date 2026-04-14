import { prisma } from '@/lib/db';
import { apiSuccess, apiError, requireDatabase } from '@/lib/api-helpers';
import { createJiraClient } from '@/lib/jira-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST /api/organisation/squads/sync-all — discover all boards and sync squads
export async function POST() {
    try {
        const dbErr = requireDatabase(); if (dbErr) return dbErr;

        const jira = createJiraClient();
        const boardsResponse = await jira.getBoards();
        const boards: Array<{ id: number; name: string }> = boardsResponse.values || [];

        if (boards.length === 0) {
            return apiError('No Jira boards found', 404);
        }

        const results: Array<{
            boardId: number;
            boardName: string;
            teamId: string;
            action: 'created' | 'updated';
            memberCount: number;
            newMembers: number;
            error?: string;
        }> = [];

        for (const board of boards) {
            try {
                // Discover members from recent sprints
                const jiraMembers = await jira.discoverBoardMembers(board.id);

                // Check if team already exists for this board
                const existingTeam = await prisma!.team.findUnique({
                    where: { boardId: board.id },
                    include: { members: true },
                });

                if (existingTeam) {
                    // Update existing team — add new members, keep existing ones
                    const existingAccountIds = new Set(existingTeam.members.map(m => m.accountId));
                    const newMembers = jiraMembers.filter(m => !existingAccountIds.has(m.accountId));

                    if (newMembers.length > 0) {
                        await prisma!.teamMember.createMany({
                            data: newMembers.map(m => ({
                                accountId: m.accountId,
                                name: m.displayName,
                                email: m.emailAddress || '',
                                role: 'engineer',
                                title: 'Associate',
                                teamId: existingTeam.id,
                            })),
                            skipDuplicates: true,
                        });
                    }

                    await prisma!.team.update({
                        where: { id: existingTeam.id },
                        data: { lastSyncedAt: new Date() },
                    });

                    results.push({
                        boardId: board.id,
                        boardName: board.name,
                        teamId: existingTeam.id,
                        action: 'updated',
                        memberCount: existingTeam.members.length + newMembers.length,
                        newMembers: newMembers.length,
                    });
                } else {
                    // Create new team
                    const team = await prisma!.team.create({
                        data: {
                            name: board.name,
                            boardId: board.id,
                            status: 'active',
                            lastSyncedAt: new Date(),
                            members: {
                                create: jiraMembers.map(m => ({
                                    accountId: m.accountId,
                                    name: m.displayName,
                                    email: m.emailAddress || '',
                                    role: 'engineer',
                                    title: 'Associate',
                                })),
                            },
                        },
                    });

                    results.push({
                        boardId: board.id,
                        boardName: board.name,
                        teamId: team.id,
                        action: 'created',
                        memberCount: jiraMembers.length,
                        newMembers: jiraMembers.length,
                    });
                }
            } catch (err) {
                results.push({
                    boardId: board.id,
                    boardName: board.name,
                    teamId: '',
                    action: 'created',
                    memberCount: 0,
                    newMembers: 0,
                    error: err instanceof Error ? err.message : 'Unknown error',
                });
            }
        }

        return apiSuccess({
                totalBoards: boards.length,
                synced: results.filter(r => !r.error).length,
                errors: results.filter(r => r.error).length,
                results,
            });
    } catch (error) {
        console.error('Error syncing all squads:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to sync squads', 500);
    }
}
