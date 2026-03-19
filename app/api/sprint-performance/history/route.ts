import { NextRequest, NextResponse } from 'next/server';
import { prisma, isDatabaseAvailable } from '@/lib/db';
import { createJiraClient } from '@/lib/jira-client';
import { calculateSprintCapacity } from '@/lib/capacity-pipeline';
import { computeVelocity, calculateSprintKPIs } from '@/lib/sprint-performance-metrics';
import { WorklogReportData, MemberWorklog, DailyWorklog, Sprint } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function generateDateRange(startIso: string, endIso: string): string[] {
  const dates: string[] = [];
  const s = new Date(startIso); s.setHours(0, 0, 0, 0);
  const e = new Date(endIso); e.setHours(23, 59, 59, 999);
  const c = new Date(s);
  while (c <= e) {
    dates.push(`${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}-${String(c.getDate()).padStart(2, '0')}`);
    c.setDate(c.getDate() + 1);
  }
  return dates;
}

async function getWorklogDataForSprint(
  sprint: Sprint,
  boardId: number,
  teamMembers: Array<{ accountId: string; name: string; role: string; title: string }>,
): Promise<WorklogReportData | null> {
  try {
    const client = createJiraClient();
    const issues = await client.getSprintIssues(sprint.id, boardId);
    if (!sprint.startDate || !sprint.endDate) return null;
    const dates = generateDateRange(sprint.startDate, sprint.endDate);
    const map = new Map<string, MemberWorklog>();
    for (const m of teamMembers) {
      map.set(m.accountId, {
        accountId: m.accountId, displayName: m.name, avatarUrl: '',
        role: m.role as 'qa' | 'engineer', title: m.title,
        dailyLogs: dates.map(d => ({ date: d, hours: 0 })), totalHours: 0,
      });
    }
    for (const issue of issues) {
      const wl = issue.fields.worklog;
      if (!wl?.worklogs?.length) continue;
      for (const log of wl.worklogs) {
        const aid = log.author.accountId;
        if (!map.has(aid)) continue;
        const member = map.get(aid)!;
        const d = new Date(log.started);
        const dk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (dates.includes(dk)) {
          const dl = member.dailyLogs.find(x => x.date === dk);
          if (dl) { const h = log.timeSpentSeconds / 3600; dl.hours += h; member.totalHours += h; }
        }
      }
    }
    return { sprintId: sprint.id, dates, memberWorklogs: Array.from(map.values()) };
  } catch { return null; }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const boardId = parseInt(url.searchParams.get('boardId') || '');
    const maxSprints = parseInt(url.searchParams.get('maxSprints') || '10');

    if (isNaN(boardId)) {
      return NextResponse.json({ success: false, error: 'boardId is required' }, { status: 400 });
    }

    let teamId: string | null = null;
    let teamMembers: Array<{ accountId: string; name: string; role: string; title: string }> = [];
    if (isDatabaseAvailable() && prisma) {
      const team = await prisma.team.findUnique({
        where: { boardId },
        include: { members: true },
      });
      if (team) {
        teamId = team.id;
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

    // Process each sprint for history row data
    const history = [];
    for (const sprint of closedSprints) {
      try {
        const issues = await jiraClient.getSprintIssuesWithChangelog(sprint.id, boardId);
        const velocity = computeVelocity(sprint, issues);

        const [capacity, worklogData] = await Promise.all([
          teamId ? calculateSprintCapacity(sprint, teamId) : Promise.resolve(null),
          getWorklogDataForSprint(sprint, boardId, teamMembers),
        ]);

        const kpis = calculateSprintKPIs(sprint, issues, capacity, worklogData, velocity);
        const completedIssues = issues.filter(i => i.fields.status?.statusCategory?.name === 'Done').length;

        history.push({
          sprintId: sprint.id,
          name: sprint.name,
          state: sprint.state,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
          workingDays: capacity?.sprintWorkingDays ?? 0,
          committedPoints: velocity.committedPoints,
          actualPoints: velocity.actualPoints,
          addedMidSprint: velocity.addedMidSprintPoints,
          commitmentAccuracy: velocity.commitmentAccuracy,
          capacityHours: kpis.capacityHours,
          committedHours: kpis.committedHours,
          loggedHours: kpis.loggedHours,
          plannedUtilisation: kpis.plannedUtilisation,
          executionUtilisation: kpis.executionUtilisation,
          completionRate: kpis.completionRate,
          avgCycleTime: kpis.avgCycleTime,
          totalIssues: issues.length,
          completedIssues,
          memberCount: capacity?.members.length ?? teamMembers.length,
        });
      } catch (err) {
        console.warn(`Failed to process sprint ${sprint.id} for history:`, err);
      }
    }

    return NextResponse.json({ success: true, data: { history } });
  } catch (error) {
    console.error('Error in sprint history API:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch sprint history' },
      { status: 500 },
    );
  }
}
