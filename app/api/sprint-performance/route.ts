import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api-helpers';
import { createJiraClient } from '@/lib/jira-client';
import { loadSprintCapacity } from '@/lib/capacity-engine';
import { computeAssignment, computeBufferReport } from '@/lib/sprint-assignment';
import { computeTaskAccuracy } from '@/lib/task-accuracy';
import {
  computeVelocity,
  calculateSprintKPIs,
  calculateEngineerMetrics,
} from '@/lib/sprint-performance-metrics';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ─── Route Handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const sprintId = parseInt(url.searchParams.get('sprintId') || '');
    const boardId = parseInt(url.searchParams.get('boardId') || '');

    if (isNaN(sprintId) || isNaN(boardId)) {
      return apiError('sprintId and boardId are required', 400);
    }

    // Resolve team from DB
    let teamId: string | null = null;
    let teamMembers: Array<{ accountId: string; name: string; role: string; title: string }> = [];

    if (prisma) {
      const team = await prisma.team.findUnique({
        where: { boardId },
        include: { members: true },
      });
      if (team) {
        teamId = team.id;
        teamMembers = team.members.map(m => ({
          accountId: m.accountId,
          name: m.name,
          role: m.role,
          title: m.title,
        }));
      }
    }

    const jiraClient = createJiraClient();

    // Fetch sprint + issues with changelog in parallel
    const [sprint, issues] = await Promise.all([
      jiraClient.getSprint(sprintId),
      jiraClient.getSprintIssuesWithChangelog(sprintId, boardId),
    ]);

    // Days-only capacity engine: theoretical mandays per member + SP assignment split
    const teamMemberIds = new Set(teamMembers.map(m => m.accountId));
    const [loaded, assignment] = await Promise.all([
      loadSprintCapacity(sprint, { boardId }),
      Promise.resolve(computeAssignment(sprint, issues)),
    ]);
    const capacityDays = loaded?.capacity ?? null;
    const capacityByAccount = new Map(capacityDays?.members.map(m => [m.accountId, m]) ?? []);

    // Buffer report (assigned vs theoretical mandays)
    const buffer = capacityDays ? computeBufferReport(capacityDays, assignment) : null;

    // Task accuracy (hours-vs-SP lens, display only)
    const accuracyResult = computeTaskAccuracy(issues);
    const accuracy = {
      team: accuracyResult.team,
      worstIssues: accuracyResult.issues.filter(i => i.ratio !== null).slice(0, 10),
    };

    // Velocity
    const velocity = computeVelocity(sprint, issues);

    // KPIs
    const kpis = calculateSprintKPIs(issues);

    // Engineer metrics
    const engineerMetrics = calculateEngineerMetrics(issues, capacityByAccount, assignment, teamMemberIds);

    // Non-dev days
    let nonDevDays: Array<{ date: string; reason: string | null }> = [];
    if (prisma && teamId) {
      const ndd = await prisma.nonDevDay.findMany({
        where: { teamId, sprintId },
        orderBy: { date: 'asc' },
        select: { date: true, reason: true },
      });
      nonDevDays = ndd.map(d => ({
        date: d.date.toISOString().split('T')[0],
        reason: d.reason,
      }));
    }

    // Capacity allocations
    let allocations: Array<{ memberName: string; type: string; capacityPercent: number; startDate: string; endDate: string }> = [];
    if (prisma && teamId) {
      const allocs = await prisma.capacityAllocation.findMany({
        where: {
          teamId,
          type: 'SPRINT',
          startDate: { lte: new Date(sprint.endDate) },
          endDate: { gte: new Date(sprint.startDate) },
        },
        include: { teamMember: { select: { name: true } } },
        orderBy: { startDate: 'asc' },
      });
      allocations = allocs.map(a => ({
        memberName: a.teamMember.name,
        type: a.type,
        capacityPercent: a.capacityPercent,
        startDate: a.startDate.toISOString().split('T')[0],
        endDate: a.endDate.toISOString().split('T')[0],
      }));
    }

    return apiSuccess({
        sprint,
        kpis,
        velocity,
        capacityDays,
        buffer,
        accuracy,
        engineerMetrics,
        nonDevDays,
        allocations,
        jiraDomain: process.env.JIRA_DOMAIN || '',
    });
  } catch (error) {
    console.error('Error in sprint performance API:', error);
    return apiError(error instanceof Error ? error.message : 'Failed to fetch sprint performance', 500);
  }
}
