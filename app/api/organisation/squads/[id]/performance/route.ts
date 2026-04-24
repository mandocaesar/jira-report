import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { apiSuccess, apiError, requireDatabase } from '@/lib/api-helpers';
import { createJiraClient } from '@/lib/jira-client';
import { calculateSprintUtilization } from '@/lib/utilization-calculator';
import { getStoryPoints, isStoryPointField, sprintFieldContainsId } from '@/lib/issue-helpers';
import { JiraIssue, Sprint, SprintVelocityEntry, SprintCommitmentCategory } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ─── Velocity helpers ─────────────────────────────────────────────────────────

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

// ─── Issue time helpers ───────────────────────────────────────────────────────

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
    if (issue.fields.status?.statusCategory?.name !== 'Done') return null;
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
        const dbErr = requireDatabase(); if (dbErr) return dbErr;

        const url = new URL(request.url);
        const startDate = url.searchParams.get('startDate');
        const endDate = url.searchParams.get('endDate');
        const maxSprints = parseInt(url.searchParams.get('maxSprints') || '10');

        const team = await prisma!.team.findUnique({
            where: { id },
            include: { members: true },
        });
        if (!team) {
            return apiError('Squad not found', 404);
        }

        const jiraClient = createJiraClient();
        const allSprints = await jiraClient.getSprints(team.boardId);

        // Filter sprints by date range
        let filteredSprints = allSprints.filter((s) => s.state === 'closed' && s.startDate && s.endDate);
        if (startDate) {
            const start = new Date(startDate);
            filteredSprints = filteredSprints.filter((s) => new Date(s.endDate) >= start);
        }
        if (endDate) {
            const end = new Date(endDate);
            filteredSprints = filteredSprints.filter((s) => new Date(s.startDate) <= end);
        }
        filteredSprints.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

        // Only process finished (closed) sprints
        const sprintsToProcess = [...filteredSprints.slice(-maxSprints)];

        // ─── Velocity ──────────────────────────────────────────────────
        const velocityRaw: Array<Omit<SprintVelocityEntry, 'committedDelta' | 'actualDelta'>> = [];
        const allIssuesBySprintId = new Map<number, JiraIssue[]>();

        for (const sprint of sprintsToProcess) {
            try {
                const issues = await jiraClient.getSprintIssuesWithChangelog(sprint.id, team.boardId);
                allIssuesBySprintId.set(sprint.id, issues);
                velocityRaw.push(computeVelocityEntry(sprint, issues));
            } catch (err) {
                console.warn(`Failed to compute velocity for sprint ${sprint.id}:`, err);
            }
        }

        const velocity: SprintVelocityEntry[] = velocityRaw.map((e, i) => ({
            ...e,
            committedPoints: Number(e.committedPoints.toFixed(2)),
            actualPoints: Number(e.actualPoints.toFixed(2)),
            addedMidSprintPoints: Number(e.addedMidSprintPoints.toFixed(2)),
            totalPoints: Number(e.totalPoints.toFixed(2)),
            committedDelta: i === 0 ? null : Number((e.committedPoints - velocityRaw[i - 1].committedPoints).toFixed(2)),
            actualDelta: i === 0 ? null : Number((e.actualPoints - velocityRaw[i - 1].actualPoints).toFixed(2)),
        }));

        // ─── Member Performance ────────────────────────────────────────
        const teamMemberIds = new Set(team.members.map((m) => m.accountId));
        const memberPerfMap = new Map<string, {
            accountId: string; name: string; role: string; title: string; avatarUrl: string;
            sprintMetrics: Array<{
                sprintId: number; sprintName: string; storyPoints: number;
                availableDays: number; effectiveMandays: number; utilizationPercent: number;
                completedIssues: number; cycleTimeAvg: number | null; leadTimeAvg: number | null;
            }>;
        }>();

        for (const sprint of sprintsToProcess) {
            try {
                const sprintIssues = await jiraClient.getSprintIssues(sprint.id, team.boardId);
                const utilization = await calculateSprintUtilization(sprint, sprintIssues, team.boardId);
                const changelogIssues = allIssuesBySprintId.get(sprint.id) || [];

                // Per-member cycle/lead time
                const memberTimings = new Map<string, { cycleTimes: number[]; leadTimes: number[]; throughput: number }>();
                for (const issue of changelogIssues) {
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
                    const aid = userUtil.user.accountId;
                    if (!memberPerfMap.has(aid)) {
                        const dbMember = team.members.find((m) => m.accountId === aid);
                        memberPerfMap.set(aid, {
                            accountId: aid,
                            name: userUtil.user.displayName,
                            role: (userUtil.role || dbMember?.role || 'engineer'),
                            title: userUtil.title || dbMember?.title || '',
                            avatarUrl: userUtil.user.avatarUrl,
                            sprintMetrics: [],
                        });
                    }

                    const timing = memberTimings.get(aid);
                    const avgCycle = timing && timing.cycleTimes.length > 0
                        ? Math.round((timing.cycleTimes.reduce((a, b) => a + b, 0) / timing.cycleTimes.length) * 10) / 10
                        : null;
                    const avgLead = timing && timing.leadTimes.length > 0
                        ? Math.round((timing.leadTimes.reduce((a, b) => a + b, 0) / timing.leadTimes.length) * 10) / 10
                        : null;

                    memberPerfMap.get(aid)!.sprintMetrics.push({
                        sprintId: sprint.id,
                        sprintName: sprint.name,
                        storyPoints: Number(userUtil.storyPoints.toFixed(2)),
                        availableDays: Number(userUtil.availableDays.toFixed(2)),
                        effectiveMandays: Number((userUtil.effectiveMandays ?? userUtil.availableDays).toFixed(2)),
                        utilizationPercent: Number(userUtil.utilizationPercent.toFixed(2)),
                        completedIssues: timing?.throughput ?? 0,
                        cycleTimeAvg: avgCycle,
                        leadTimeAvg: avgLead,
                    });
                }
            } catch (err) {
                console.warn(`Failed to process sprint ${sprint.id}:`, err);
            }
        }

        // Compute averages
        const memberPerformance = Array.from(memberPerfMap.values()).map((m) => {
            const metrics = m.sprintMetrics;
            if (metrics.length === 0) return { ...m, averages: { storyPoints: 0, utilization: 0, cycleTime: null, leadTime: null, throughput: 0 } };
            const avgSP = metrics.reduce((s, d) => s + d.storyPoints, 0) / metrics.length;
            const avgUtil = metrics.reduce((s, d) => s + d.utilizationPercent, 0) / metrics.length;
            const cycleVals = metrics.filter((d) => d.cycleTimeAvg !== null).map((d) => d.cycleTimeAvg!);
            const leadVals = metrics.filter((d) => d.leadTimeAvg !== null).map((d) => d.leadTimeAvg!);
            const totalThroughput = metrics.reduce((s, d) => s + d.completedIssues, 0);
            return {
                ...m,
                averages: {
                    storyPoints: Number(avgSP.toFixed(2)),
                    utilization: Number(avgUtil.toFixed(2)),
                    cycleTime: cycleVals.length > 0 ? Number((cycleVals.reduce((a, b) => a + b, 0) / cycleVals.length).toFixed(2)) : null,
                    leadTime: leadVals.length > 0 ? Number((leadVals.reduce((a, b) => a + b, 0) / leadVals.length).toFixed(2)) : null,
                    throughput: Number((totalThroughput / metrics.length).toFixed(2)),
                },
            };
        }).sort((a, b) => a.name.localeCompare(b.name));

        // ─── Aggregate KPIs ────────────────────────────────────────────
        const closedVelocity = velocity.filter((v) => v.sprint.state === 'closed');
        const totalCommittedRaw = closedVelocity.reduce((s, v) => s + v.committedPoints, 0);
        const totalActualRaw = closedVelocity.reduce((s, v) => s + v.actualPoints, 0);
        const totalCommitted = Number(totalCommittedRaw.toFixed(2));
        const totalActual = Number(totalActualRaw.toFixed(2));
        const avgVelocity = closedVelocity.length > 0 ? Number((totalActualRaw / closedVelocity.length).toFixed(2)) : 0;
        const avgAccuracy = closedVelocity.length > 0 ? Math.round(closedVelocity.reduce((s, v) => s + v.commitmentAccuracy, 0) / closedVelocity.length) : 0;

        // Aggregate cycle/lead time from all issues
        const allCycleTimes: number[] = [];
        const allLeadTimes: number[] = [];
        let totalCompletedIssues = 0;
        let totalCommittedIssues = 0;
        for (const sprint of sprintsToProcess) {
            const issues = allIssuesBySprintId.get(sprint.id) || [];
            totalCommittedIssues += issues.length;
            for (const issue of issues) {
                if (issue.fields.status?.statusCategory?.name === 'Done') {
                    totalCompletedIssues++;
                    const times = calculateIssueTimes(issue);
                    if (times) {
                        allCycleTimes.push(times.cycleTimeDays);
                        allLeadTimes.push(times.leadTimeDays);
                    }
                }
            }
        }

        const avgCycleTime = allCycleTimes.length > 0
            ? Number((allCycleTimes.reduce((a, b) => a + b, 0) / allCycleTimes.length).toFixed(2))
            : null;
        const medianCycleTime = allCycleTimes.length > 0
            ? (() => { const sorted = [...allCycleTimes].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2); return Number((sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2).toFixed(2)); })()
            : null;
        const avgLeadTime = allLeadTimes.length > 0
            ? Number((allLeadTimes.reduce((a, b) => a + b, 0) / allLeadTimes.length).toFixed(2))
            : null;
        const completionRate = totalCommittedIssues > 0 ? Math.round((totalCompletedIssues / totalCommittedIssues) * 100) : 0;

        // ─── Distribution (Epic + Label) ───────────────────────────────
        const epicDistribution: Record<string, { name: string; points: number; count: number }> = {};
        const labelDistribution: Record<string, { label: string; points: number; count: number }> = {};

        for (const issues of allIssuesBySprintId.values()) {
            for (const issue of issues) {
                const pts = getStoryPoints(issue);

                // Epic grouping (parent)
                const epicKey = issue.fields.parent?.key || 'No Epic';
                const epicName = issue.fields.parent?.fields.summary || 'No Epic';
                if (!epicDistribution[epicKey]) epicDistribution[epicKey] = { name: epicName, points: 0, count: 0 };
                epicDistribution[epicKey].points += pts;
                epicDistribution[epicKey].count++;

                // Label grouping
                const labels: string[] = issue.fields.labels || [];
                if (labels.length === 0) {
                    if (!labelDistribution['Unlabeled']) labelDistribution['Unlabeled'] = { label: 'Unlabeled', points: 0, count: 0 };
                    labelDistribution['Unlabeled'].points += pts;
                    labelDistribution['Unlabeled'].count++;
                } else {
                    for (const label of labels) {
                        if (!labelDistribution[label]) labelDistribution[label] = { label, points: 0, count: 0 };
                        labelDistribution[label].points += pts;
                        labelDistribution[label].count++;
                    }
                }
            }
        }

        // ─── Sprint summary table ──────────────────────────────────────
        const sprintSummaries = [];
        for (const sprint of sprintsToProcess) {
            try {
                const issues = await jiraClient.getSprintIssues(sprint.id, team.boardId);
                const util = await calculateSprintUtilization(sprint, issues, team.boardId);
                const vel = velocity.find((v) => v.sprint.id === sprint.id);
                sprintSummaries.push({
                    sprintId: sprint.id,
                    name: sprint.name,
                    state: sprint.state,
                    startDate: sprint.startDate,
                    endDate: sprint.endDate,
                    committedPoints: vel?.committedPoints ?? 0,
                    actualPoints: vel?.actualPoints ?? 0,
                    addedMidSprint: vel?.addedMidSprintPoints ?? 0,
                    accuracy: vel?.commitmentAccuracy ?? 0,
                    totalStoryPoints: Number(util.totalStoryPoints.toFixed(2)),
                    avgUtilization: Number(util.averageUtilization.toFixed(2)),
                    memberCount: util.userUtilizations.length,
                    workingDays: util.totalWorkingDays,
                });
            } catch (err) {
                console.warn(`Failed to build sprint summary for ${sprint.id}:`, err);
            }
        }

        // ─── SP Estimation Accuracy (across period) ─────────────────────
        const EXPECTED_HOURS_PER_SP = 7;
        const memberWorklogMap = new Map<string, { name: string; role: string; completedPoints: number; worklogHours: number }>();

        for (const issues of allIssuesBySprintId.values()) {
            for (const issue of issues) {
                const isDone = issue.fields.status?.statusCategory?.name === 'Done';
                if (!isDone) continue;
                const isSubtask = issue.fields.issuetype.subtask === true || issue.fields.issuetype.name.toLowerCase().includes('sub-chore');
                if (!isSubtask) continue;

                const assigneeId = issue.fields.assignee?.accountId;
                if (!assigneeId || !teamMemberIds.has(assigneeId)) continue;

                const pts = getStoryPoints(issue);
                const worklogs = issue.fields.worklog?.worklogs || [];
                const issueHours = worklogs.reduce((sum: number, wl: any) => sum + ((wl.timeSpentSeconds || 0) / 3600), 0);

                if (!memberWorklogMap.has(assigneeId)) {
                    const dbMember = team.members.find((m) => m.accountId === assigneeId);
                    memberWorklogMap.set(assigneeId, {
                        name: issue.fields.assignee?.displayName || 'Unknown',
                        role: dbMember?.role || 'engineer',
                        completedPoints: 0,
                        worklogHours: 0,
                    });
                }
                const entry = memberWorklogMap.get(assigneeId)!;
                entry.completedPoints += pts;
                entry.worklogHours += issueHours;
            }
        }

        const spAccuracyMembers = Array.from(memberWorklogMap.values())
            .filter(m => m.completedPoints > 0)
            .map(m => {
                const avgHoursPerSP = Math.round((m.worklogHours / m.completedPoints) * 10) / 10;
                const accuracy = avgHoursPerSP > 0 ? Math.round((EXPECTED_HOURS_PER_SP / avgHoursPerSP) * 1000) / 10 : null;
                return {
                    name: m.name,
                    role: m.role,
                    completedPoints: m.completedPoints,
                    worklogHours: Math.round(m.worklogHours * 10) / 10,
                    avgHoursPerSP,
                    accuracy,
                };
            })
            .sort((a, b) => b.completedPoints - a.completedPoints);

        const spTeamCompletedPts = spAccuracyMembers.reduce((s, m) => s + m.completedPoints, 0);
        const spTeamWorklogHrs = spAccuracyMembers.reduce((s, m) => s + m.worklogHours, 0);
        const spTeamAvgHoursPerSP = spTeamCompletedPts > 0 ? Math.round((spTeamWorklogHrs / spTeamCompletedPts) * 10) / 10 : null;
        const spTeamAccuracy = spTeamAvgHoursPerSP && spTeamAvgHoursPerSP > 0
            ? Math.round((EXPECTED_HOURS_PER_SP / spTeamAvgHoursPerSP) * 1000) / 10
            : null;

        const spAccuracy = {
            expectedHoursPerSP: EXPECTED_HOURS_PER_SP,
            teamCompletedPoints: spTeamCompletedPts,
            teamWorklogHours: Math.round(spTeamWorklogHrs * 10) / 10,
            teamAvgHoursPerSP: spTeamAvgHoursPerSP,
            teamAccuracy: spTeamAccuracy,
            members: spAccuracyMembers,
        };

        const data = {
            kpis: {
                totalCommitted: totalCommitted,
                totalActual: totalActual,
                avgVelocity,
                avgAccuracy,
                completionRate,
                avgCycleTime,
                medianCycleTime,
                avgLeadTime,
                sprintCount: closedVelocity.length,
                totalCompletedIssues,
                totalCommittedIssues,
            },
            velocity,
            memberPerformance,
            sprintSummaries,
            spAccuracy,
            epicDistribution: Object.values(epicDistribution).map(e => ({...e, points: Number(e.points.toFixed(2))})).sort((a, b) => b.points - a.points),
            labelDistribution: Object.values(labelDistribution).map(l => ({...l, points: Number(l.points.toFixed(2))})).sort((a, b) => b.points - a.points),
        };

        return apiSuccess(data);
    } catch (error) {
        console.error('Error fetching squad performance:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to fetch performance data', 500);
    }
}
