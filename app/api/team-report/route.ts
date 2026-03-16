import { NextRequest, NextResponse } from 'next/server';
import { createJiraClient } from '@/lib/jira-client';
import { calculateSprintUtilization } from '@/lib/utilization-calculator';
import { JiraIssue } from '@/types';

/**
 * Calculate cycle time (In Progress → Done) and lead time (Created → Done) in business days.
 * Returns { cycleTimeDays, leadTimeDays } or null if issue is not Done.
 */
function calculateIssueTimes(issue: JiraIssue): { cycleTimeDays: number; leadTimeDays: number } | null {
    const isDone = issue.fields.status?.statusCategory?.name === 'Done';
    if (!isDone) return null;

    const histories = issue.changelog?.histories || [];

    // Find first transition to "In Progress" category
    let firstInProgressDate: Date | null = null;
    let doneDate: Date | null = null;

    // Sort histories chronologically
    const sorted = [...histories].sort(
        (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime()
    );

    for (const history of sorted) {
        for (const item of history.items) {
            if (item.field !== 'status') continue;

            // First time entering "In Progress" category
            if (!firstInProgressDate && item.toString) {
                // Check if the toString status maps to In Progress category
                // We look at the transition — if moving TO a status that's In Progress category
                const toCategory = getStatusCategory(item.toString);
                if (toCategory === 'In Progress') {
                    firstInProgressDate = new Date(history.created);
                }
            }

            // Last time entering "Done" category
            if (item.toString) {
                const toCategory = getStatusCategory(item.toString);
                if (toCategory === 'Done') {
                    doneDate = new Date(history.created);
                }
            }
        }
    }

    if (!doneDate) return null;

    const createdDate = new Date(issue.fields.created);
    const leadTimeDays = businessDaysBetween(createdDate, doneDate);
    const cycleTimeDays = firstInProgressDate
        ? businessDaysBetween(firstInProgressDate, doneDate)
        : leadTimeDays; // Fallback: if no In Progress transition found, use lead time

    return { cycleTimeDays, leadTimeDays };
}

/** Map known status names to categories */
function getStatusCategory(statusName: string): string {
    const lower = statusName.toLowerCase();
    const todoStatuses = ['to do', 'open', 'backlog', 'new', 'reopened', 'funnel', 'selected for development'];
    const doneStatuses = ['done', 'closed', 'resolved', 'released', 'completed'];

    if (todoStatuses.some(s => lower === s)) return 'To Do';
    if (doneStatuses.some(s => lower === s)) return 'Done';
    return 'In Progress'; // Everything else is treated as In Progress
}

/** Calculate business days between two dates (excluding weekends) */
function businessDaysBetween(start: Date, end: Date): number {
    if (end <= start) return 0;
    let count = 0;
    const current = new Date(start);
    current.setHours(0, 0, 0, 0);
    const endNorm = new Date(end);
    endNorm.setHours(0, 0, 0, 0);

    while (current <= endNorm) {
        const day = current.getDay();
        if (day !== 0 && day !== 6) count++;
        current.setDate(current.getDate() + 1);
    }
    return Math.max(count, 1); // Minimum 1 day
}

interface SprintMemberMetrics {
    sprintId: number;
    sprintName: string;
    storyPoints: number;
    availableDays: number;
    utilizationPercent: number;
    deliveredSubTasks: number;
    deliveredSubChores: number;
    deliveredOther: number;
    totalSubTasks: number;
    totalSubChores: number;
    totalOther: number;
    completionRate: number;
    cycleTimeAvg: number | null;   // avg business days (In Progress → Done)
    leadTimeAvg: number | null;    // avg business days (Created → Done)
    throughput: number;            // total issues completed
}

// GET /api/team-report?boardId=xxx&sprintCount=5
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const boardIdParam = searchParams.get('boardId');
        const sprintCountParam = searchParams.get('sprintCount') || '5';

        if (!boardIdParam) {
            return NextResponse.json({ success: false, error: 'boardId is required' }, { status: 400 });
        }

        const boardId = parseInt(boardIdParam);
        const sprintCount = Math.min(parseInt(sprintCountParam), 10);
        const jiraClient = createJiraClient();

        // Fetch closed + active sprints
        const allSprints = await jiraClient.getSprints(boardId);
        const closedSprints = allSprints
            .filter(s => s.state === 'closed' && s.startDate && s.endDate)
            .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
            .slice(0, sprintCount);
        const activeSprints = allSprints.filter(s => s.state === 'active' && s.startDate && s.endDate);
        const sprints = [...activeSprints, ...closedSprints].slice(0, sprintCount);

        if (sprints.length === 0) {
            return NextResponse.json({ success: true, data: { boardId, sprints: [], members: [] } });
        }

        // Fetch issues WITH changelog for all sprints in parallel
        const sprintDataPromises = sprints.map(async (sprint) => {
            const [issues, utilization] = await Promise.all([
                jiraClient.getSprintIssuesWithChangelog(sprint.id, boardId),
                (async () => {
                    const issuesForUtil = await jiraClient.getSprintIssues(sprint.id, boardId);
                    return calculateSprintUtilization(sprint, issuesForUtil, boardId);
                })(),
            ]);
            return { sprint, issues, utilization };
        });

        const sprintResults = await Promise.all(sprintDataPromises);

        // Aggregate per member across sprints
        const memberAgg = new Map<string, {
            accountId: string;
            name: string;
            role: string;
            title: string;
            avatarUrl: string;
            sprints: SprintMemberMetrics[];
        }>();

        for (const { sprint, issues, utilization } of sprintResults) {
            // Build per-member issue counts + timing from raw issues
            const memberMetrics = new Map<string, {
                deliveredSubTasks: number;
                deliveredSubChores: number;
                deliveredOther: number;
                totalSubTasks: number;
                totalSubChores: number;
                totalOther: number;
                cycleTimes: number[];
                leadTimes: number[];
                throughput: number;
            }>();

            for (const issue of issues) {
                const assigneeId = issue.fields.assignee?.accountId;
                if (!assigneeId) continue;

                if (!memberMetrics.has(assigneeId)) {
                    memberMetrics.set(assigneeId, {
                        deliveredSubTasks: 0, deliveredSubChores: 0, deliveredOther: 0,
                        totalSubTasks: 0, totalSubChores: 0, totalOther: 0,
                        cycleTimes: [], leadTimes: [], throughput: 0,
                    });
                }
                const m = memberMetrics.get(assigneeId)!;
                const typeName = issue.fields.issuetype.name.toLowerCase();
                const isDone = issue.fields.status?.statusCategory?.name === 'Done';

                if (typeName === 'sub-task' || (issue.fields.issuetype.subtask && typeName !== 'sub-chore')) {
                    m.totalSubTasks++;
                    if (isDone) m.deliveredSubTasks++;
                } else if (typeName === 'sub-chore') {
                    m.totalSubChores++;
                    if (isDone) m.deliveredSubChores++;
                } else {
                    m.totalOther++;
                    if (isDone) m.deliveredOther++;
                }

                // Calculate timing for completed issues
                if (isDone) {
                    m.throughput++;
                    const times = calculateIssueTimes(issue);
                    if (times) {
                        m.cycleTimes.push(times.cycleTimeDays);
                        m.leadTimes.push(times.leadTimeDays);
                    }
                }
            }

            // Merge utilization data with metrics
            for (const userUtil of utilization.userUtilizations) {
                const id = userUtil.user.accountId;
                if (!memberAgg.has(id)) {
                    memberAgg.set(id, {
                        accountId: id,
                        name: userUtil.user.displayName,
                        role: userUtil.role,
                        title: userUtil.title,
                        avatarUrl: userUtil.user.avatarUrl,
                        sprints: [],
                    });
                }

                const metrics = memberMetrics.get(id) || {
                    deliveredSubTasks: 0, deliveredSubChores: 0, deliveredOther: 0,
                    totalSubTasks: 0, totalSubChores: 0, totalOther: 0,
                    cycleTimes: [], leadTimes: [], throughput: 0,
                };
                const totalAssigned = metrics.totalSubTasks + metrics.totalSubChores + metrics.totalOther;
                const totalDelivered = metrics.deliveredSubTasks + metrics.deliveredSubChores + metrics.deliveredOther;

                const avgCycle = metrics.cycleTimes.length > 0
                    ? Math.round((metrics.cycleTimes.reduce((a, b) => a + b, 0) / metrics.cycleTimes.length) * 10) / 10
                    : null;
                const avgLead = metrics.leadTimes.length > 0
                    ? Math.round((metrics.leadTimes.reduce((a, b) => a + b, 0) / metrics.leadTimes.length) * 10) / 10
                    : null;

                memberAgg.get(id)!.sprints.push({
                    sprintId: sprint.id,
                    sprintName: sprint.name,
                    storyPoints: userUtil.storyPoints,
                    availableDays: userUtil.availableDays,
                    utilizationPercent: Math.round(userUtil.utilizationPercent * 10) / 10,
                    deliveredSubTasks: metrics.deliveredSubTasks,
                    deliveredSubChores: metrics.deliveredSubChores,
                    deliveredOther: metrics.deliveredOther,
                    totalSubTasks: metrics.totalSubTasks,
                    totalSubChores: metrics.totalSubChores,
                    totalOther: metrics.totalOther,
                    completionRate: totalAssigned > 0 ? Math.round((totalDelivered / totalAssigned) * 100) : 0,
                    cycleTimeAvg: avgCycle,
                    leadTimeAvg: avgLead,
                    throughput: metrics.throughput,
                });
            }
        }

        // Build response with summary
        const members = Array.from(memberAgg.values()).map(m => {
            const sd = m.sprints;
            const totalSP = sd.reduce((s, d) => s + d.storyPoints, 0);
            const totalAvailDays = sd.reduce((s, d) => s + d.availableDays, 0);
            const avgUtilization = totalAvailDays > 0 ? (totalSP / totalAvailDays) * 100 : 0;
            const totalDeliveredSubTasks = sd.reduce((s, d) => s + d.deliveredSubTasks, 0);
            const totalDeliveredSubChores = sd.reduce((s, d) => s + d.deliveredSubChores, 0);
            const totalDeliveredOther = sd.reduce((s, d) => s + d.deliveredOther, 0);
            const totalAssigned = sd.reduce((s, d) => s + d.totalSubTasks + d.totalSubChores + d.totalOther, 0);
            const totalDelivered = totalDeliveredSubTasks + totalDeliveredSubChores + totalDeliveredOther;
            const avgCompletionRate = totalAssigned > 0 ? Math.round((totalDelivered / totalAssigned) * 100) : 0;

            // Average cycle/lead time across sprints (only sprints with data)
            const cycleVals = sd.filter(d => d.cycleTimeAvg !== null).map(d => d.cycleTimeAvg!);
            const leadVals = sd.filter(d => d.leadTimeAvg !== null).map(d => d.leadTimeAvg!);
            const avgCycleTime = cycleVals.length > 0
                ? Math.round((cycleVals.reduce((a, b) => a + b, 0) / cycleVals.length) * 10) / 10
                : null;
            const avgLeadTime = leadVals.length > 0
                ? Math.round((leadVals.reduce((a, b) => a + b, 0) / leadVals.length) * 10) / 10
                : null;
            const totalThroughput = sd.reduce((s, d) => s + d.throughput, 0);
            const avgThroughput = sd.length > 0
                ? Math.round((totalThroughput / sd.length) * 10) / 10
                : 0;

            return {
                ...m,
                summary: {
                    totalStoryPoints: totalSP,
                    totalAvailableDays: totalAvailDays,
                    avgUtilization: Math.round(avgUtilization * 10) / 10,
                    totalDeliveredSubTasks,
                    totalDeliveredSubChores,
                    totalDeliveredOther,
                    totalDelivered,
                    totalAssigned,
                    avgCompletionRate,
                    sprintCount: sd.length,
                    avgCycleTime,
                    avgLeadTime,
                    totalThroughput,
                    avgThroughput,
                },
            };
        });

        // Sort by name
        members.sort((a, b) => a.name.localeCompare(b.name));

        return NextResponse.json({
            success: true,
            data: {
                boardId,
                sprintCount: sprints.length,
                sprintNames: sprints.map(s => s.name),
                members,
            },
        });
    } catch (error) {
        console.error('Error generating team report:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Failed to generate report' },
            { status: 500 }
        );
    }
}
