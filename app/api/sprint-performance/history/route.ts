import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api-helpers';
import { createJiraClient } from '@/lib/jira-client';
import { loadSprintCapacity } from '@/lib/capacity-engine';
import { computeAssignment, computeBufferReport } from '@/lib/sprint-assignment';
import { computeVelocity, calculateSprintKPIs } from '@/lib/sprint-performance-metrics';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const boardId = parseInt(url.searchParams.get('boardId') || '');
    const maxSprints = parseInt(url.searchParams.get('maxSprints') || '10');

    if (isNaN(boardId)) {
      return apiError('boardId is required', 400);
    }

    let teamMembers: Array<{ accountId: string; name: string; role: string; title: string }> = [];
    if (prisma) {
      const team = await prisma.team.findUnique({
        where: { boardId },
        include: { members: true },
      });
      if (team) {
        teamMembers = team.members.map(m => ({ accountId: m.accountId, name: m.name, role: m.role, title: m.title }));
      }
    }

    const jiraClient = createJiraClient();
    const allSprints = await jiraClient.getSprints(boardId);

    // Get closed sprints, sorted by start date descending (most recent first)
    const closedSprints = allSprints
      .filter(s => s.state === 'closed' && s.startDate && s.endDate)
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
      .slice(0, maxSprints);

    // Process sprints in parallel (chunked to avoid API rate limits). No batch fn on the
    // days-only engine (unlike the old hour pipeline) — loadSprintCapacity runs per sprint
    // inside the same chunked Promise.all that already fetches issues.
    const chunkSize = 3;
    const history = [];
    for (let i = 0; i < closedSprints.length; i += chunkSize) {
      const chunk = closedSprints.slice(i, i + chunkSize);
      const chunkResults = await Promise.all(chunk.map(async (sprint) => {
        try {
          const issues = await jiraClient.getSprintIssuesWithChangelog(sprint.id, boardId);
          const velocity = computeVelocity(sprint, issues);
          const kpis = calculateSprintKPIs(issues);

          const [loaded, assignment] = await Promise.all([
            loadSprintCapacity(sprint, { boardId }),
            Promise.resolve(computeAssignment(sprint, issues)),
          ]);
          const capacityDays = loaded?.capacity ?? null;
          const buffer = capacityDays ? computeBufferReport(capacityDays, assignment) : null;
          const theoreticalMandays = buffer?.theoreticalMandays ?? 0;
          const assignedAtStart = buffer?.assignedAtStart ?? 0;
          const utilization = theoreticalMandays > 0
            ? Math.round((assignedAtStart / theoreticalMandays) * 1000) / 10
            : 0;

          const completedIssues = issues.filter(i => i.fields.status?.statusCategory?.name === 'Done').length;

          return {
            sprintId: sprint.id,
            name: sprint.name,
            state: sprint.state,
            startDate: sprint.startDate,
            endDate: sprint.endDate,
            workingDays: capacityDays?.sprintWorkingDays ?? 0,
            committedPoints: velocity.committedPoints,
            actualPoints: velocity.actualPoints,
            addedMidSprint: velocity.addedMidSprintPoints,
            commitmentAccuracy: velocity.commitmentAccuracy,
            theoreticalMandays: Math.round(theoreticalMandays * 10) / 10,
            assignedAtStart: Math.round(assignedAtStart * 10) / 10,
            utilization,
            completionRate: kpis.completionRate,
            avgCycleTime: kpis.avgCycleTime,
            totalIssues: issues.length,
            completedIssues,
            memberCount: capacityDays?.members.length ?? teamMembers.length,
          };
        } catch (err) {
          console.warn(`Failed to process sprint ${sprint.id} for history:`, err);
          return null;
        }
      }));
      history.push(...chunkResults.filter(Boolean));
    }

    return apiSuccess({ history }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    console.error('Error in sprint history API:', error);
    return apiError(error instanceof Error ? error.message : 'Failed to fetch sprint history', 500);
  }
}
