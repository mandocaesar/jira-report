import { NextRequest, NextResponse } from 'next/server';
import { prisma, isDatabaseAvailable } from '@/lib/db';
import { createJiraClient } from '@/lib/jira-client';
import { calculateSprintUtilization } from '@/lib/utilization-calculator';
import { getStoryPoints, isStoryPointField, sprintFieldContainsId } from '@/lib/issue-helpers';
import { JiraIssue, Sprint, SprintVelocityEntry, SprintCommitmentCategory, SquadHealthData, SquadMemberPerformance, SquadOverview } from '@/types';

export const dynamic = 'force-dynamic';

// ─── Velocity helpers (reused from sprint-velocity route) ─────────────────────

type CategoryKey = 'stories' | 'subTasks' | 'subChores' | 'incidents';

function getCategory(issue: JiraIssue): CategoryKey {
    const name = issue.fields.issuetype.name.toLowerCase();
    if (name.includes('sub-chore') || name === 'sub chore') return 'subChores';
    if (issue.fields.issuetype.subtask === true) return 'subTasks';
    if (['incident', 'bug', 'defect'].includes(name)) return 'incidents';
    return 'stories';
}

function getPointsAtStart(issue: JiraIssue, sprintStartDayEnd: number): number {
    const current = getStoryPoints(issue);
    if (!issue.changelog?.histories) return current;
    const laterChanges: Array<{ time: number; fromVal: string }> = [];
    for (const h of issue.changelog.histories) {
        const t = new Date(h.created).getTime();
        if (t <= sprintStartDayEnd) continue;
        for (const item of h.items) {
            if (isStoryPointField(item.fieldId, item.field)) {
                laterChanges.push({ time: t, fromVal: item.fromString || '0' });
            }
        }
    }
    if (laterChanges.length === 0) return current;
    laterChanges.sort((a, b) => a.time - b.time);
    return parseFloat(laterChanges[0].fromVal || '0');
}

function isAddedMidSprint(issue: JiraIssue, sprint: Sprint, sprintStartDayEnd: number): boolean {
    if (issue.fields.created && new Date(issue.fields.created).getTime() > sprintStartDayEnd) return true;
    if (issue.changelog?.histories) {
        for (const h of issue.changelog.histories) {
            const t = new Date(h.created).getTime();
            if (t <= sprintStartDayEnd) continue;
            for (const item of h.items) {
                if (item.field === 'Sprint' || item.fieldId === 'customfield_10020') {
                    if (sprintFieldContainsId(item.to, sprint.id) || item.toString?.includes(sprint.name)) return true;
                }
            }
        }
    }
    return false;
}

function computeVelocityEntry(sprint: Sprint, issues: JiraIssue[]): Omit<SprintVelocityEntry, 'committedDelta' | 'actualDelta'> {
    const startDayEnd = (() => { const d = new Date(sprint.startDate); d.setHours(23, 59, 59, 999); return d.getTime(); })();
    const mkCat = (): SprintCommitmentCategory => ({ committed: 0, actual: 0, count: 0, addedMidSprint: 0, addedMidSprintCount: 0 });
    const breakdown: Record<CategoryKey, SprintCommitmentCategory> = { stories: mkCat(), subTasks: mkCat(), subChores: mkCat(), incidents: mkCat() };

    let committedPoints = 0, actualPoints = 0, addedMidSprintPoints = 0, addedMidSprintCount = 0;
    for (const issue of issues) {
        const cat = getCategory(issue);
        const added = isAddedMidSprint(issue, sprint, startDayEnd);
        const currentPts = getStoryPoints(issue);
        const committedPts = added ? 0 : getPointsAtStart(issue, startDayEnd);
        const done = issue.fields.status?.statusCategory?.name === 'Done';
        breakdown[cat].count++;
        breakdown[cat].committed += committedPts;
        if (done) breakdown[cat].actual += currentPts;
        if (added) { breakdown[cat].addedMidSprint += currentPts; breakdown[cat].addedMidSprintCount++; addedMidSprintPoints += currentPts; addedMidSprintCount++; }
        else { committedPoints += committedPts; }
        if (done) actualPoints += currentPts;
    }

    const totalPoints = issues.reduce((s, i) => s + getStoryPoints(i), 0);
    const commitmentAccuracy = committedPoints > 0 ? Math.round((actualPoints / committedPoints) * 100) : 0;
    return { sprint, committedPoints, actualPoints, totalPoints, addedMidSprintPoints, addedMidSprintCount, commitmentAccuracy, breakdown };
}

// ─── Cycle/Lead time helpers ──────────────────────────────────────────────────

function getStatusCategory(statusName: string): string {
    const lower = statusName.toLowerCase();
    if (['to do', 'open', 'backlog', 'new', 'reopened', 'funnel', 'selected for development'].some(s => lower === s)) return 'To Do';
    if (['done', 'closed', 'resolved', 'released', 'completed'].some(s => lower === s)) return 'Done';
    return 'In Progress';
}

function businessDaysBetween(start: Date, end: Date): number {
    if (end <= start) return 0;
    let count = 0;
    const current = new Date(start); current.setHours(0, 0, 0, 0);
    const endNorm = new Date(end); endNorm.setHours(0, 0, 0, 0);
    while (current <= endNorm) { const day = current.getDay(); if (day !== 0 && day !== 6) count++; current.setDate(current.getDate() + 1); }
    return Math.max(count, 1);
}

function calculateIssueTimes(issue: JiraIssue): { cycleTimeDays: number; leadTimeDays: number } | null {
    const isDone = issue.fields.status?.statusCategory?.name === 'Done';
    if (!isDone) return null;
    const histories = issue.changelog?.histories || [];
    let firstInProgressDate: Date | null = null;
    let doneDate: Date | null = null;
    const sorted = [...histories].sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());
    for (const history of sorted) {
        for (const item of history.items) {
            if (item.field !== 'status') continue;
            if (!firstInProgressDate && item.toString && getStatusCategory(item.toString) === 'In Progress') firstInProgressDate = new Date(history.created);
            if (item.toString && getStatusCategory(item.toString) === 'Done') doneDate = new Date(history.created);
        }
    }
    if (!doneDate) return null;
    const createdDate = new Date(issue.fields.created);
    const leadTimeDays = businessDaysBetween(createdDate, doneDate);
    const cycleTimeDays = firstInProgressDate ? businessDaysBetween(firstInProgressDate, doneDate) : leadTimeDays;
    return { cycleTimeDays, leadTimeDays };
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        if (!isDatabaseAvailable() || !prisma) {
            return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 });
        }

        const team = await prisma.team.findUnique({
            where: { id },
            include: { members: true, department: { select: { name: true } } },
        });

        if (!team) {
            return NextResponse.json({ success: false, error: 'Squad not found' }, { status: 404 });
        }

        const sprintCount = parseInt(new URL(request.url).searchParams.get('sprintCount') || '5');
        const jiraClient = createJiraClient();

        // ─── Squad Overview ────────────────────────────────────────────
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

        const allSprints = await jiraClient.getSprints(team.boardId);
        const activeSprint = allSprints.find(s => s.state === 'active');
        const closedSprints = allSprints
            .filter(s => s.state === 'closed' && s.startDate && s.endDate)
            .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
            .slice(0, sprintCount);

        const sprintsToProcess = [...(activeSprint ? [activeSprint] : []), ...closedSprints].slice(0, sprintCount);

        // ─── Current Sprint Progress ───────────────────────────────────
        if (activeSprint) {
            const activeIssues = await jiraClient.getSprintIssues(activeSprint.id, team.boardId);
            const activeUtil = await calculateSprintUtilization(activeSprint, activeIssues, team.boardId);

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
                committedPoints: activeUtil.totalStoryPoints,
                completedPoints: activeUtil.userUtilizations.reduce((sum, u) => sum + u.storyPoints, 0),
                completionPercent: activeUtil.totalStoryPoints > 0
                    ? Math.round((activeUtil.userUtilizations.reduce((sum, u) => sum + u.storyPoints, 0) / activeUtil.totalStoryPoints) * 100)
                    : 0,
            };
        }

        // ─── Velocity (all sprints with changelog) ────────────────────
        const velocityRaw: Array<Omit<SprintVelocityEntry, 'committedDelta' | 'actualDelta'>> = [];
        for (const sprint of [...sprintsToProcess].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())) {
            try {
                const issues = await jiraClient.getSprintIssuesWithChangelog(sprint.id, team.boardId);
                velocityRaw.push(computeVelocityEntry(sprint, issues));
            } catch (err) {
                console.warn(`Failed to compute velocity for sprint ${sprint.id}:`, err);
            }
        }
        const velocity: SprintVelocityEntry[] = velocityRaw.map((e, i) => ({
            ...e,
            committedDelta: i === 0 ? null : e.committedPoints - velocityRaw[i - 1].committedPoints,
            actualDelta: i === 0 ? null : e.actualPoints - velocityRaw[i - 1].actualPoints,
        }));

        // ─── Member Performance & Workload ─────────────────────────────
        const memberPerfMap = new Map<string, SquadMemberPerformance>();
        const teamMemberIds = new Set(team.members.map(m => m.accountId));

        for (const sprint of sprintsToProcess) {
            try {
                const [issues, utilization] = await Promise.all([
                    jiraClient.getSprintIssuesWithChangelog(sprint.id, team.boardId),
                    (async () => {
                        const issuesForUtil = await jiraClient.getSprintIssues(sprint.id, team.boardId);
                        return calculateSprintUtilization(sprint, issuesForUtil, team.boardId);
                    })(),
                ]);

                // Per-member cycle/lead time from issues
                const memberTimings = new Map<string, { cycleTimes: number[]; leadTimes: number[]; throughput: number }>();
                for (const issue of issues) {
                    const assigneeId = issue.fields.assignee?.accountId;
                    if (!assigneeId || !teamMemberIds.has(assigneeId)) continue;
                    if (!memberTimings.has(assigneeId)) memberTimings.set(assigneeId, { cycleTimes: [], leadTimes: [], throughput: 0 });
                    const m = memberTimings.get(assigneeId)!;
                    if (issue.fields.status?.statusCategory?.name === 'Done') {
                        m.throughput++;
                        const times = calculateIssueTimes(issue);
                        if (times) { m.cycleTimes.push(times.cycleTimeDays); m.leadTimes.push(times.leadTimeDays); }
                    }
                }

                for (const userUtil of utilization.userUtilizations) {
                    if (!teamMemberIds.has(userUtil.user.accountId)) continue;
                    const id = userUtil.user.accountId;
                    if (!memberPerfMap.has(id)) {
                        const dbMember = team.members.find(m => m.accountId === id);
                        memberPerfMap.set(id, {
                            accountId: id,
                            name: userUtil.user.displayName,
                            role: (userUtil.role || dbMember?.role || 'engineer') as 'qa' | 'engineer',
                            title: userUtil.title || dbMember?.title || '',
                            avatarUrl: userUtil.user.avatarUrl,
                            workingHoursPerDay: dbMember?.workingHoursPerDay ?? undefined,
                            sprintMetrics: [],
                            averages: { storyPoints: 0, utilization: 0, cycleTime: null, leadTime: null, throughput: 0 },
                        });
                    }

                    const timing = memberTimings.get(id);
                    const avgCycle = timing && timing.cycleTimes.length > 0
                        ? Math.round((timing.cycleTimes.reduce((a, b) => a + b, 0) / timing.cycleTimes.length) * 10) / 10
                        : null;
                    const avgLead = timing && timing.leadTimes.length > 0
                        ? Math.round((timing.leadTimes.reduce((a, b) => a + b, 0) / timing.leadTimes.length) * 10) / 10
                        : null;

                    memberPerfMap.get(id)!.sprintMetrics.push({
                        sprintId: sprint.id,
                        sprintName: sprint.name,
                        storyPoints: userUtil.storyPoints,
                        availableDays: userUtil.availableDays,
                        effectiveMandays: userUtil.effectiveMandays ?? userUtil.availableDays,
                        utilizationPercent: Math.round(userUtil.utilizationPercent * 10) / 10,
                        completedIssues: timing?.throughput ?? 0,
                        cycleTimeAvg: avgCycle,
                        leadTimeAvg: avgLead,
                    });
                }
            } catch (err) {
                console.warn(`Failed to process sprint ${sprint.id} for member perf:`, err);
            }
        }

        // Compute averages
        const memberPerformance: SquadMemberPerformance[] = Array.from(memberPerfMap.values()).map(m => {
            const metrics = m.sprintMetrics;
            if (metrics.length === 0) return m;

            const avgSP = metrics.reduce((s, d) => s + d.storyPoints, 0) / metrics.length;
            const avgUtil = metrics.reduce((s, d) => s + d.utilizationPercent, 0) / metrics.length;
            const cycleVals = metrics.filter(d => d.cycleTimeAvg !== null).map(d => d.cycleTimeAvg!);
            const leadVals = metrics.filter(d => d.leadTimeAvg !== null).map(d => d.leadTimeAvg!);
            const totalThroughput = metrics.reduce((s, d) => s + d.completedIssues, 0);

            m.averages = {
                storyPoints: Math.round(avgSP * 10) / 10,
                utilization: Math.round(avgUtil * 10) / 10,
                cycleTime: cycleVals.length > 0 ? Math.round((cycleVals.reduce((a, b) => a + b, 0) / cycleVals.length) * 10) / 10 : null,
                leadTime: leadVals.length > 0 ? Math.round((leadVals.reduce((a, b) => a + b, 0) / leadVals.length) * 10) / 10 : null,
                throughput: Math.round((totalThroughput / metrics.length) * 10) / 10,
            };
            return m;
        });
        memberPerformance.sort((a, b) => a.name.localeCompare(b.name));

        // ─── Workload Distribution (current sprint) ───────────────────
        const workloadDistribution = memberPerformance.map(m => {
            const currentMetrics = activeSprint
                ? m.sprintMetrics.find(s => s.sprintId === activeSprint.id)
                : m.sprintMetrics[m.sprintMetrics.length - 1]; // latest sprint

            const utilPct = currentMetrics?.utilizationPercent ?? 0;
            let status: 'under' | 'optimal' | 'over' = 'optimal';
            if (utilPct < 60) status = 'under';
            else if (utilPct > 120) status = 'over';

            return {
                accountId: m.accountId,
                name: m.name,
                role: m.role,
                currentPoints: currentMetrics?.storyPoints ?? 0,
                currentUtilization: utilPct,
                status,
            };
        });

        const data: SquadHealthData = { squad, velocity, memberPerformance, workloadDistribution };
        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('Error fetching squad detail:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Failed to fetch squad detail' },
            { status: 500 }
        );
    }
}
