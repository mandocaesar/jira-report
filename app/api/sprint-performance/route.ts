import { NextRequest, NextResponse } from 'next/server';
import { prisma, isDatabaseAvailable } from '@/lib/db';
import { createJiraClient } from '@/lib/jira-client';
import { calculateSprintCapacity } from '@/lib/capacity-pipeline';
import {
  computeVelocity,
  calculateSprintKPIs,
  calculateEngineerMetrics,
} from '@/lib/sprint-performance-metrics';
import { calculateSprintReport } from '@/lib/sprint-report-calculator';
import { WorklogReportData, MemberWorklog, DailyWorklog } from '@/types';
import { generateDateRange } from '@/lib/date-utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ─── Inline worklog aggregation (same logic as /api/worklogs) ──────────────────

async function getWorklogData(
  sprintId: number,
  boardId: number,
  teamMembers: Array<{ accountId: string; name: string; role: string; title: string }>,
): Promise<WorklogReportData | null> {
  try {
    const client = createJiraClient();
    const [sprint, issues] = await Promise.all([
      client.getSprint(sprintId),
      client.getSprintIssues(sprintId, boardId),
    ]);

    if (!sprint.startDate || !sprint.endDate) return null;
    const dates = generateDateRange(sprint.startDate, sprint.endDate);

    const memberWorklogsMap = new Map<string, MemberWorklog>();
    const memberDailyLogIndex = new Map<string, Map<string, DailyWorklog>>();
    for (const member of teamMembers) {
      const dailyLogs: DailyWorklog[] = dates.map(date => ({ date, hours: 0 }));
      const logIndex = new Map<string, DailyWorklog>();
      for (const dl of dailyLogs) logIndex.set(dl.date, dl);
      memberDailyLogIndex.set(member.accountId, logIndex);
      memberWorklogsMap.set(member.accountId, {
        accountId: member.accountId,
        displayName: member.name,
        avatarUrl: '',
        role: member.role as 'qa' | 'engineer',
        title: member.title,
        dailyLogs,
        totalHours: 0,
      });
    }

    for (const issue of issues) {
      if (issue.fields.assignee && memberWorklogsMap.has(issue.fields.assignee.accountId)) {
        const m = memberWorklogsMap.get(issue.fields.assignee.accountId)!;
        if (!m.avatarUrl && issue.fields.assignee.avatarUrls?.['48x48']) {
          m.avatarUrl = issue.fields.assignee.avatarUrls['48x48'];
        }
      }
      const worklogData = issue.fields.worklog;
      if (!worklogData?.worklogs?.length) continue;
      for (const log of worklogData.worklogs) {
        const authorId = log.author.accountId;
        if (!memberWorklogsMap.has(authorId)) continue;
        const member = memberWorklogsMap.get(authorId)!;
        const startedDate = new Date(log.started);
        const year = startedDate.getFullYear();
        const month = String(startedDate.getMonth() + 1).padStart(2, '0');
        const day = String(startedDate.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;
        if (dates.includes(dateKey)) {
          const hours = log.timeSpentSeconds / 3600;
          const dailyLog = memberDailyLogIndex.get(authorId)?.get(dateKey);
          if (dailyLog) {
            dailyLog.hours += hours;
            member.totalHours += hours;
          }
        }
      }
    }

    return {
      sprintId,
      dates,
      memberWorklogs: Array.from(memberWorklogsMap.values()),
    };
  } catch {
    return null;
  }
}

// ─── Route Handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const sprintId = parseInt(url.searchParams.get('sprintId') || '');
    const boardId = parseInt(url.searchParams.get('boardId') || '');

    if (isNaN(sprintId) || isNaN(boardId)) {
      return NextResponse.json(
        { success: false, error: 'sprintId and boardId are required' },
        { status: 400 },
      );
    }

    // Resolve team from DB
    let teamId: string | null = null;
    let teamMembers: Array<{ accountId: string; name: string; role: string; title: string }> = [];

    if (isDatabaseAvailable() && prisma) {
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

    // Run capacity pipeline + velocity + worklogs in parallel
    const teamMemberIds = new Set(teamMembers.map(m => m.accountId));
    const [capacity, worklogData, sprintReport] = await Promise.all([
      teamId ? calculateSprintCapacity(sprint, teamId) : Promise.resolve(null),
      getWorklogData(sprintId, boardId, teamMembers),
      calculateSprintReport(sprint, issues, boardId),
    ]);

    // Velocity
    const velocity = computeVelocity(sprint, issues);

    // KPIs
    const kpis = calculateSprintKPIs(sprint, issues, capacity, worklogData, velocity);

    // Engineer metrics
    const engineerMetrics = calculateEngineerMetrics(issues, capacity, worklogData, teamMemberIds);

    // Non-dev days
    let nonDevDays: Array<{ date: string; reason: string | null }> = [];
    if (isDatabaseAvailable() && prisma && teamId) {
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
    if (isDatabaseAvailable() && prisma && teamId) {
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

    return NextResponse.json({
      success: true,
      data: {
        sprint,
        kpis,
        velocity,
        capacity: capacity ? {
          sprintWorkingDays: capacity.sprintWorkingDays,
          totalCapacityHours: capacity.totalCapacityHours,
          totalAvailableHours: capacity.totalAvailableHours,
          totalEffectiveMandays: capacity.totalEffectiveMandays,
          teamStandardHours: capacity.teamStandardHours,
        } : null,
        engineerMetrics,
        report: sprintReport,
        worklogData,
        nonDevDays,
        allocations,
        jiraDomain: process.env.JIRA_DOMAIN || '',
      },
    });
  } catch (error) {
    console.error('Error in sprint performance API:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch sprint performance' },
      { status: 500 },
    );
  }
}
