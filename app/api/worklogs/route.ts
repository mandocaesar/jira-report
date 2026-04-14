import { NextRequest, NextResponse } from 'next/server';
import { createJiraClient } from '@/lib/jira-client';
import { WorklogReportData, MemberWorklog, DailyWorklog } from '@/types';
import { prisma, isDatabaseAvailable } from '@/lib/db';
import { teamRoster } from '@/lib/team-roster';
import { generateDateRange } from '@/lib/date-utils';

export const dynamic = 'force-dynamic';

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

        // 1. Fetch team members (DB preferred, fallback to JSON)
        const teamMembersMap = new Map<string, any>();
        let usedDb = false;

        if (isDatabaseAvailable() && prisma) {
            try {
                const dbTeams = await prisma.team.findMany({
                    where: { boardId: parseInt(boardId) },
                    include: { members: true }
                });

                if (dbTeams.length > 0) {
                    usedDb = true;
                    for (const team of dbTeams) {
                        for (const member of team.members) {
                            teamMembersMap.set(member.accountId, {
                                ...member,
                                teamId: team.id,
                                teamName: team.name
                            });
                        }
                    }
                }
            } catch (err) {
                console.warn('Failed to fetch team members from DB for worklogs, fallback to JSON', err);
            }
        }

        if (!usedDb) {
            for (const [teamId, teamConfig] of Object.entries(teamRoster.teams)) {
                if (teamConfig.boardId === parseInt(boardId)) {
                    for (const member of teamConfig.members) {
                        teamMembersMap.set(member.accountId, {
                            ...member,
                            teamId,
                            teamName: teamConfig.name
                        });
                    }
                }
            }
        }

        // 2. Fetch Sprint and Issues
        const client = createJiraClient();

        const [sprint, issues] = await Promise.all([
            client.getSprint(parseInt(sprintId)),
            client.getSprintIssues(parseInt(sprintId), parseInt(boardId))
        ]);

        if (!sprint.startDate || !sprint.endDate) {
            return NextResponse.json(
                { error: 'Sprint does not have a start or end date' },
                { status: 400 }
            );
        }

        // 3. Generate Date Range array
        const dates = generateDateRange(sprint.startDate, sprint.endDate);

        // 4. Initialize Member Worklogs with a date→log Map for O(1) lookup
        const memberWorklogsMap = new Map<string, MemberWorklog>();
        const memberDailyLogIndex = new Map<string, Map<string, DailyWorklog>>();

        for (const [accountId, member] of teamMembersMap.entries()) {
            const dailyLogs: DailyWorklog[] = dates.map(date => ({ date, hours: 0 }));
            const logIndex = new Map<string, DailyWorklog>();
            for (const dl of dailyLogs) logIndex.set(dl.date, dl);
            memberDailyLogIndex.set(accountId, logIndex);

            memberWorklogsMap.set(accountId, {
                accountId,
                displayName: member.name,
                avatarUrl: '',
                role: member.role as 'qa' | 'engineer',
                title: member.title,
                dailyLogs,
                totalHours: 0
            });
        }

        // 5. Aggregate Worklogs
        for (const issue of issues) {
            // Update avatar URL if we see the user as assignee
            if (issue.fields.assignee && memberWorklogsMap.has(issue.fields.assignee.accountId)) {
                const member = memberWorklogsMap.get(issue.fields.assignee.accountId)!;
                if (!member.avatarUrl && issue.fields.assignee.avatarUrls?.['48x48']) {
                    member.avatarUrl = issue.fields.assignee.avatarUrls['48x48'];
                }
            }

            const worklogData = issue.fields.worklog;
            if (!worklogData || !worklogData.worklogs || worklogData.worklogs.length === 0) {
                continue;
            }

            for (const log of worklogData.worklogs) {
                const authorId = log.author.accountId;
                if (!memberWorklogsMap.has(authorId)) {
                    continue; // Skip logs from non-team members
                }

                const member = memberWorklogsMap.get(authorId)!;

                // Parse the started date (ISO 8601 string)
                const startedDate = new Date(log.started);
                const year = startedDate.getFullYear();
                const month = String(startedDate.getMonth() + 1).padStart(2, '0');
                const day = String(startedDate.getDate()).padStart(2, '0');
                const dateKey = `${year}-${month}-${day}`;

                // Only count worklogs within the sprint date range
                if (dates.includes(dateKey)) {
                    const hours = log.timeSpentSeconds / 3600;
                    const logIndex = memberDailyLogIndex.get(authorId);
                    const dailyLog = logIndex?.get(dateKey);
                    if (dailyLog) {
                        dailyLog.hours += hours;
                        member.totalHours += hours;
                    }
                }
            }
        }

        // Return array sorted by role (engineer then qa) and then by name
        const memberWorklogs = Array.from(memberWorklogsMap.values()).sort((a, b) => {
            if (a.role !== b.role) {
                return a.role === 'engineer' ? -1 : 1;
            }
            return a.displayName.localeCompare(b.displayName);
        });

        const reportData: WorklogReportData = {
            sprintId: parseInt(sprintId),
            dates,
            memberWorklogs
        };

        return NextResponse.json({ success: true, data: reportData });

    } catch (error) {
        console.error('Error in Worklogs API:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
