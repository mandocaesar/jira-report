import { NextResponse } from 'next/server';
import { prisma, isDatabaseAvailable } from '@/lib/db';
import { createJiraClient } from '@/lib/jira-client';
import { calculateSprintUtilization } from '@/lib/utilization-calculator';
import { SquadOverview } from '@/types';

export const dynamic = 'force-dynamic';

// GET /api/squads — list all squads with health summary
export async function GET() {
    try {
        if (!isDatabaseAvailable() || !prisma) {
            return NextResponse.json(
                { success: false, error: 'Database not configured' },
                { status: 503 }
            );
        }

        const teams = await prisma.team.findMany({
            include: {
                members: true,
                department: { select: { name: true } },
            },
            orderBy: { name: 'asc' },
        });

        const jiraClient = createJiraClient();

        // Process all teams in parallel for speed
        const squadPromises = teams.map(async (team): Promise<SquadOverview> => {
            const squad: SquadOverview = {
                id: team.id,
                name: team.name,
                boardId: team.boardId,
                departmentName: team.department?.name,
                memberCount: team.members.length,
                engineerCount: team.members.filter(m => m.role === 'engineer').length,
                qaCount: team.members.filter(m => m.role === 'qa').length,
                workingHoursPerDay: team.workingHoursPerDay,
            };

            try {
                const allSprints = await jiraClient.getSprints(team.boardId);

                // Current/active sprint
                const activeSprint = allSprints.find(s => s.state === 'active');
                if (activeSprint) {
                    const issues = await jiraClient.getSprintIssues(activeSprint.id, team.boardId);
                    const utilization = await calculateSprintUtilization(activeSprint, issues, team.boardId);

                    const now = new Date();
                    const start = new Date(activeSprint.startDate);
                    const end = new Date(activeSprint.endDate);
                    const totalDuration = end.getTime() - start.getTime();
                    const elapsed = now.getTime() - start.getTime();
                    const progress = totalDuration > 0 ? Math.min(Math.max((elapsed / totalDuration) * 100, 0), 100) : 0;

                    squad.currentSprint = {
                        id: activeSprint.id,
                        name: activeSprint.name,
                        state: activeSprint.state,
                        progress: Math.round(progress),
                        committedPoints: utilization.totalStoryPoints + (utilization.totalEffectiveMandays > 0 ? 0 : 0),
                        completedPoints: utilization.userUtilizations.reduce((sum, u) => sum + u.storyPoints, 0),
                        completionPercent: utilization.totalStoryPoints > 0
                            ? Math.round((utilization.userUtilizations.reduce((sum, u) => sum + u.storyPoints, 0) / utilization.totalStoryPoints) * 100)
                            : 0,
                    };
                }

                // Recent velocity (last 3 closed sprints)
                const closedSprints = allSprints
                    .filter(s => s.state === 'closed' && s.startDate && s.endDate)
                    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
                    .slice(0, 3);

                if (closedSprints.length > 0) {
                    const velocities = await Promise.all(
                        closedSprints.map(async (sprint) => {
                            const issues = await jiraClient.getSprintIssues(sprint.id, team.boardId);
                            const util = await calculateSprintUtilization(sprint, issues, team.boardId);
                            return {
                                committed: util.totalStoryPoints,
                                actual: util.userUtilizations.reduce((s, u) => s + u.storyPoints, 0),
                            };
                        })
                    );

                    const avgCommitted = velocities.reduce((s, v) => s + v.committed, 0) / velocities.length;
                    const avgActual = velocities.reduce((s, v) => s + v.actual, 0) / velocities.length;

                    let trend: 'up' | 'down' | 'stable' = 'stable';
                    if (velocities.length >= 2) {
                        const latest = velocities[0].actual;
                        const prev = velocities.slice(1).reduce((s, v) => s + v.actual, 0) / (velocities.length - 1);
                        if (latest > prev * 1.1) trend = 'up';
                        else if (latest < prev * 0.9) trend = 'down';
                    }

                    squad.recentVelocity = {
                        avgCommitted: Math.round(avgCommitted * 10) / 10,
                        avgActual: Math.round(avgActual * 10) / 10,
                        avgAccuracy: avgCommitted > 0 ? Math.round((avgActual / avgCommitted) * 100) : 0,
                        trend,
                        sprintCount: closedSprints.length,
                    };
                }
            } catch (err) {
                console.warn(`Failed to fetch Jira data for team ${team.name}:`, err);
            }

            return squad;
        });

        const squads = await Promise.all(squadPromises);

        return NextResponse.json({ success: true, data: squads });
    } catch (error) {
        console.error('Error fetching squads:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Failed to fetch squads' },
            { status: 500 }
        );
    }
}
