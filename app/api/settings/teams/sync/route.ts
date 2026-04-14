import { prisma } from '@/lib/db';
import { apiSuccess, apiError, requireDatabase } from '@/lib/api-helpers';
import { createJiraClient } from '@/lib/jira-client';

interface SyncMember {
    accountId: string;
    displayName: string;
    email: string;
}

interface SyncResult {
    toAdd: SyncMember[];
    missingFromSprint: Array<{ accountId: string; name: string; email: string; role: string; title: string }>;
    matched: Array<{ accountId: string; name: string; email: string; role: string; title: string }>;
}

// POST /api/settings/teams/sync — compare/sync team roster with Jira sprint assignees
export async function POST(request: Request) {
    try {
        const dbErr = requireDatabase(); if (dbErr) return dbErr;

        const { boardId, sprintId, apply } = await request.json();

        if (!boardId) {
            return apiError('boardId is required', 400);
        }

        const jiraClient = createJiraClient();

        // Determine which sprint to use
        let targetSprintId = sprintId;
        if (!targetSprintId) {
            // Find the latest active or closed sprint for this board
            const sprints = await jiraClient.getSprints(boardId);
            const activeSprint = sprints.find(s => s.state === 'active');
            const latestClosed = sprints
                .filter(s => s.state === 'closed')
                .sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime())[0];
            targetSprintId = activeSprint?.id || latestClosed?.id;

            if (!targetSprintId) {
                return apiError('No sprints found for this board', 404);
            }
        }

        // Fetch sprint issues from Jira
        const issues = await jiraClient.getSprintIssues(targetSprintId, boardId);

        // Extract unique assignees from issues
        const jiraAssignees = new Map<string, SyncMember>();
        for (const issue of issues) {
            const assignee = issue.fields.assignee;
            if (assignee && !jiraAssignees.has(assignee.accountId)) {
                jiraAssignees.set(assignee.accountId, {
                    accountId: assignee.accountId,
                    displayName: assignee.displayName,
                    email: assignee.emailAddress || '',
                });
            }
        }

        // Get current team roster from DB
        let team = await prisma!.team.findUnique({
            where: { boardId: parseInt(boardId) },
            include: { members: true },
        });

        // Auto-create team if it doesn't exist
        if (!team) {
            // Try to get the board name from Jira for a meaningful team name
            let teamName = `Board ${boardId}`;
            try {
                const boards = await jiraClient.getBoards();
                const board = boards.values?.find((b: any) => b.id === parseInt(boardId));
                if (board?.name) {
                    teamName = board.name;
                }
            } catch (err) {
                console.warn('Could not fetch board name from Jira, using default:', err);
            }

            team = await prisma!.team.create({
                data: {
                    name: teamName,
                    boardId: parseInt(boardId),
                },
                include: { members: true },
            });
        }

        // Build roster lookup
        const rosterMap = new Map<string, typeof team.members[0]>();
        for (const member of team.members) {
            rosterMap.set(member.accountId, member);
        }

        // Compare: find differences
        const result: SyncResult = {
            toAdd: [],
            missingFromSprint: [],
            matched: [],
        };

        // Members in Jira but not in roster
        for (const [accountId, jiraMember] of jiraAssignees) {
            if (rosterMap.has(accountId)) {
                const rosterMember = rosterMap.get(accountId)!;
                result.matched.push({
                    accountId,
                    name: rosterMember.name,
                    email: rosterMember.email,
                    role: rosterMember.role,
                    title: rosterMember.title,
                });
            } else {
                result.toAdd.push(jiraMember);
            }
        }

        // Members in roster but not in Jira sprint
        for (const [accountId, member] of rosterMap) {
            if (!jiraAssignees.has(accountId)) {
                result.missingFromSprint.push({
                    accountId,
                    name: member.name,
                    email: member.email,
                    role: member.role,
                    title: member.title,
                });
            }
        }

        // Apply changes if requested
        let addedCount = 0;
        if (apply && result.toAdd.length > 0) {
            for (const member of result.toAdd) {
                await prisma!.teamMember.upsert({
                    where: {
                        teamId_accountId: {
                            teamId: team.id,
                            accountId: member.accountId,
                        },
                    },
                    update: {
                        name: member.displayName,
                        email: member.email,
                    },
                    create: {
                        teamId: team.id,
                        accountId: member.accountId,
                        name: member.displayName,
                        email: member.email,
                        role: 'engineer',
                        title: 'Associate',
                    },
                });
                addedCount++;
            }
        }

        return apiSuccess({
            sprintId: targetSprintId,
            teamId: team.id,
            teamName: team.name,
            totalJiraAssignees: jiraAssignees.size,
            totalRosterMembers: team.members.length,
            ...result,
            applied: apply ? true : false,
            addedCount,
        });
    } catch (error) {
        console.error('Error syncing team:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to sync team', 500);
    }
}
