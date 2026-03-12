import { JiraIssue, Sprint, WeeklyMetrics, TimeMetrics, MetricsData } from '@/types';

/**
 * Relevant issue types for metrics
 */
const TRACKED_TYPES = ['Story', 'Task', 'Test'];

/**
 * Status names that indicate "testing/QA" phase.
 * We check case-insensitively for these keywords.
 */
const TEST_STATUS_KEYWORDS = ['test', 'qa', 'review', 'verification', 'validat'];

/**
 * Check if a status name indicates a testing/QA phase
 */
function isTestingStatus(statusName: string): boolean {
    const lower = statusName.toLowerCase();
    return TEST_STATUS_KEYWORDS.some(kw => lower.includes(kw));
}



/**
 * Changelog entry from Jira API
 */
interface ChangelogEntry {
    id: string;
    created: string;
    items: Array<{
        field: string;
        fromString: string | null;
        toString: string | null;
        from: string | null;
        to: string | null;
    }>;
}

/**
 * Extract status transitions from an issue's changelog
 */
function getStatusTransitions(issue: JiraIssue): Array<{
    timestamp: Date;
    fromStatus: string;
    toStatus: string;
    toCategory: string;
}> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const changelog = (issue as unknown as { changelog?: any }).changelog;
    if (!changelog || !changelog.histories) return [];

    const transitions: Array<{
        timestamp: Date;
        fromStatus: string;
        toStatus: string;
        toCategory: string;
    }> = [];

    for (const history of changelog.histories as ChangelogEntry[]) {
        for (const item of history.items) {
            if (item.field === 'status' && item.toString) {
                transitions.push({
                    timestamp: new Date(history.created),
                    fromStatus: item.fromString || '',
                    toStatus: item.toString,
                    // We infer category from the status name — the changelog
                    // doesn't always include category. For "Done" detection,
                    // we'll check current status if this is the latest transition.
                    toCategory: '', // Will be resolved contextually
                });
            }
        }
    }

    // Sort by timestamp ascending
    transitions.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return transitions;
}

/**
 * Find the first timestamp when an issue transitioned to "In Progress" category.
 * We detect this by looking for transitions where the from is a "To Do"-like status
 * and the to is an active status.
 */
function findFirstInProgressTime(issue: JiraIssue): Date | null {
    const transitions = getStatusTransitions(issue);
    // Look for first transition to any non-To Do status (i.e., work started)
    for (const t of transitions) {
        // The first transition away from the initial status is typically "In Progress"
        // We check by finding transitions where "To Do"/"Open"/"Backlog" → something else
        const fromLower = t.fromStatus.toLowerCase();
        const isFromToDo = ['to do', 'open', 'backlog', 'new', 'created', ''].includes(fromLower);
        if (isFromToDo && t.toStatus) {
            return t.timestamp;
        }
    }
    return null;
}

/**
 * Find the first timestamp when an issue entered a testing/QA status
 */
function findFirstTestTime(issue: JiraIssue): Date | null {
    const transitions = getStatusTransitions(issue);
    for (const t of transitions) {
        if (isTestingStatus(t.toStatus)) {
            return t.timestamp;
        }
    }
    return null;
}

/**
 * Find the first timestamp when an issue reached "Done" status.
 * We check the issue's current status category AND changelog.
 */
function findDoneTime(issue: JiraIssue): Date | null {
    const currentCategory = issue.fields.status?.statusCategory?.name;

    // If current status is not Done, this issue hasn't been completed
    if (currentCategory !== 'Done') return null;

    const transitions = getStatusTransitions(issue);
    // Find the first transition to a "Done"-like status
    for (const t of transitions) {
        const toLower = t.toStatus.toLowerCase();
        if (['done', 'closed', 'resolved', 'complete', 'completed'].includes(toLower)) {
            return t.timestamp;
        }
    }

    // If we can't find an explicit "Done" transition but the issue is Done,
    // use the last transition timestamp
    if (transitions.length > 0) {
        return transitions[transitions.length - 1].timestamp;
    }

    return null;
}



/**
 * Build weekly buckets for a sprint
 */
function buildWeekBuckets(sprint: Sprint): Array<{ weekStart: Date; weekEnd: Date; label: string }> {
    const start = new Date(sprint.startDate);
    const end = new Date(sprint.endDate);
    const buckets: Array<{ weekStart: Date; weekEnd: Date; label: string }> = [];

    const weekStart = new Date(start);
    let weekNum = 1;

    while (weekStart < end) {
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        // Cap at sprint end
        const cappedEnd = weekEnd > end ? end : weekEnd;

        buckets.push({
            weekStart: new Date(weekStart),
            weekEnd: cappedEnd,
            label: `Week ${weekNum}`,
        });

        weekStart.setDate(weekStart.getDate() + 7);
        weekNum++;
    }

    return buckets;
}

/**
 * Determine which week bucket a date falls into
 */
function findWeekBucket(date: Date, buckets: Array<{ weekStart: Date; weekEnd: Date }>): number {
    for (let i = 0; i < buckets.length; i++) {
        if (date >= buckets[i].weekStart && date <= buckets[i].weekEnd) {
            return i;
        }
    }
    // If after sprint end, put in last bucket
    if (date > buckets[buckets.length - 1].weekEnd) {
        return buckets.length - 1;
    }
    // If before sprint start, put in first bucket
    return 0;
}

/**
 * Calculate hours between two dates
 */
function hoursBetween(start: Date, end: Date): number {
    return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
}

/**
 * Calculate all metrics for a sprint
 */
export function calculateMetrics(sprint: Sprint, issues: JiraIssue[]): MetricsData {
    // Filter to tracked parent issue types only (not subtasks)
    const trackedIssues = issues.filter(issue => {
        const typeName = issue.fields.issuetype.name;
        const isSubtask = issue.fields.issuetype.subtask;
        return !isSubtask && TRACKED_TYPES.some(t =>
            typeName.toLowerCase().includes(t.toLowerCase())
        );
    });

    console.log(`[Metrics] Total issues: ${issues.length}, Tracked (Story/Task/Test): ${trackedIssues.length}`);

    // Build week buckets
    const weekBuckets = buildWeekBuckets(sprint);
    const weeklyData: WeeklyMetrics[] = weekBuckets.map(b => ({
        weekLabel: b.label,
        weekStart: b.weekStart.toISOString(),
        weekEnd: b.weekEnd.toISOString(),
        storyCount: 0,
        taskCount: 0,
        testCount: 0,
        totalCount: 0,
        doneCount: 0,
        completionRate: 0,
    }));

    // Time metrics accumulators (These will be calculated via isolated loops below)
    const deliverTimes: number[] = [];
    const testTimes: number[] = [];
    const doneTimes: number[] = [];

    interface MemberAgg {
        accountId: string;
        displayName: string;
        avatarUrl: string;
        deliverTimes: number[];
        doneTimes: number[];
    }
    const memberMap = new Map<string, MemberAgg>();

    function trackMemberTime(issue: JiraIssue, metric: 'deliver' | 'done', hours: number) {
        if (!issue.fields.assignee) return;
        const assignee = issue.fields.assignee;
        const accountId = assignee.accountId;
        if (!accountId) return;

        if (!memberMap.has(accountId)) {
            // Jira User object can have varied structures for avatar
            const avatarUrl = (assignee as any).avatarUrls?.['48x48'] || '';
            memberMap.set(accountId, {
                accountId,
                displayName: assignee.displayName || 'Unknown',
                avatarUrl,
                deliverTimes: [],
                doneTimes: []
            });
        }

        const member = memberMap.get(accountId)!;
        if (metric === 'deliver') member.deliverTimes.push(hours);
        if (metric === 'done') member.doneTimes.push(hours);
    }

    // Totals
    let totalStory = 0, totalTask = 0, totalTest = 0, totalDone = 0;

    for (const issue of trackedIssues) {
        const typeName = issue.fields.issuetype.name.toLowerCase();
        const createdDate = new Date(issue.fields.created);
        const isDone = issue.fields.status?.statusCategory?.name === 'Done';

        // Determine which week this issue belongs to (by creation date or done date)
        // Use done date if available, creation date otherwise
        const doneTime = findDoneTime(issue);
        const bucketDate = doneTime || createdDate;
        const weekIdx = findWeekBucket(bucketDate, weekBuckets);

        // Count by type
        if (typeName.includes('story')) {
            totalStory++;
            if (weekIdx >= 0 && weekIdx < weeklyData.length) weeklyData[weekIdx].storyCount++;
        } else if (typeName.includes('test')) {
            totalTest++;
            if (weekIdx >= 0 && weekIdx < weeklyData.length) weeklyData[weekIdx].testCount++;
        } else if (typeName.includes('task')) {
            totalTask++;
            if (weekIdx >= 0 && weekIdx < weeklyData.length) weeklyData[weekIdx].taskCount++;
        }

        if (weekIdx >= 0 && weekIdx < weeklyData.length) {
            weeklyData[weekIdx].totalCount++;
            if (isDone) {
                weeklyData[weekIdx].doneCount++;
                totalDone++;
            }
        }
    }

    // Isolate MTD (Mean Time to Deliver) entirely to Story-type issues
    const storyIssues = issues.filter(issue =>
        !issue.fields.issuetype.subtask &&
        issue.fields.issuetype.name.toLowerCase().includes('story')
    );

    for (const issue of storyIssues) {
        const firstInProgress = findFirstInProgressTime(issue);

        const createdDate = new Date(issue.fields.created);
        const sprintStartDate = new Date(sprint.startDate);
        const baselineDate = sprintStartDate > createdDate ? sprintStartDate : createdDate;

        // MTD: baseline → first In Progress
        if (firstInProgress) {
            const hours = hoursBetween(baselineDate, firstInProgress);
            if (hours >= 0) {
                deliverTimes.push(hours);
                trackMemberTime(issue, 'deliver', hours);
            }
        }
    }

    // Isolate MTTT (Mean Time To Test) exclusively to 'test' and 'qa-test' issues
    const testIssuesList = issues.filter(issue => {
        const typeName = issue.fields.issuetype.name.toLowerCase();
        return typeName.includes('test') || typeName.includes('qa-test');
    });

    for (const issue of testIssuesList) {
        const doneTime = findDoneTime(issue);
        const isDone = issue.fields.status?.statusCategory?.name === 'Done';

        if (isDone && doneTime) {
            const createdDate = new Date(issue.fields.created);
            const sprintStartDate = new Date(sprint.startDate);
            const baselineDate = sprintStartDate > createdDate ? sprintStartDate : createdDate;

            // MTTT: baseline → Done for test issues
            const hours = hoursBetween(baselineDate, doneTime);
            if (hours >= 0) testTimes.push(hours);
        }
    }

    // Isolate MTTC exclusively to Sub-tasks and Sub-chores
    const subtaskAndChoreIssues = issues.filter(issue => {
        const isSubtask = issue.fields.issuetype.subtask;
        const typeName = issue.fields.issuetype.name.toLowerCase();
        return isSubtask || typeName.includes('sub-chore');
    });

    for (const issue of subtaskAndChoreIssues) {
        const doneTime = findDoneTime(issue);
        const isDone = issue.fields.status?.statusCategory?.name === 'Done';

        if (isDone && doneTime) {
            const createdDate = new Date(issue.fields.created);
            const sprintStartDate = new Date(sprint.startDate);
            const baselineDate = sprintStartDate > createdDate ? sprintStartDate : createdDate;

            // MTTD: baseline → Done
            const hours = hoursBetween(baselineDate, doneTime);
            if (hours >= 0) {
                doneTimes.push(hours);
                trackMemberTime(issue, 'done', hours);
            }
        }
    }

    // Calculate weekly completion rates
    for (const week of weeklyData) {
        week.completionRate = week.totalCount > 0
            ? (week.doneCount / week.totalCount) * 100
            : 0;
    }

    // Calculate mean times
    const mean = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    const timeMetrics: TimeMetrics = {
        meanTimeToDeliver: mean(deliverTimes),
        meanTimeToTest: mean(testTimes),
        meanTimeToDone: mean(doneTimes),
        sampleSize: {
            deliver: deliverTimes.length,
            test: testTimes.length,
            done: doneTimes.length,
        },
    };

    const memberTimeMetrics = Array.from(memberMap.values()).map(m => ({
        accountId: m.accountId,
        displayName: m.displayName,
        avatarUrl: m.avatarUrl,
        meanTimeToDeliver: mean(m.deliverTimes),
        meanTimeToDone: mean(m.doneTimes),
        sampleSize: {
            deliver: m.deliverTimes.length,
            done: m.doneTimes.length
        }
    })).filter(m => m.sampleSize.deliver > 0 || m.sampleSize.done > 0)
        .sort((a, b) => b.sampleSize.done - a.sampleSize.done);

    const totalCount = totalStory + totalTask + totalTest;

    return {
        sprint,
        weeklyMetrics: weeklyData,
        timeMetrics,
        memberTimeMetrics,
        totals: {
            storyCount: totalStory,
            taskCount: totalTask,
            testCount: totalTest,
            totalCount,
            doneCount: totalDone,
            completionRate: totalCount > 0 ? (totalDone / totalCount) * 100 : 0,
        },
    };
}
