import { JiraIssue, Sprint, User, SprintReportData, StatusGroup, MemberBreakdown, ReportIssue, ScopeChange, SpAccuracy, SpAccuracyEntry } from '@/types';
import { getMemberByAccountId, getTeamByBoardIdFromDb } from './team-roster';
import { getStoryPoints, extractUser, isStoryPointField, getStatusCategory, getStatusName, sprintFieldContainsId } from './issue-helpers';
import { HOURS_PER_MANDAY } from './constants';

/**
 * Calculates scope changes (added to sprint, points changed)
 */
function calculateScopeChanges(sprint: Sprint, issues: JiraIssue[]): ScopeChange[] {
    const changes: ScopeChange[] = [];
    const sprintStartDate = new Date(sprint.startDate);

    // Changes on the same calendar date as sprint start are considered part of planning, not scope changes
    const sprintStartDayEnd = new Date(sprintStartDate);
    sprintStartDayEnd.setHours(23, 59, 59, 999);
    const sprintStartDayEndTime = sprintStartDayEnd.getTime();

    for (const issue of issues) {
        let wasAddedDuringSprint = false;

        // 1. Check if the issue was created after sprint start day
        if (issue.fields.created) {
            const createdTime = Date.parse(issue.fields.created);
            if (createdTime > sprintStartDayEndTime) {
                wasAddedDuringSprint = true;
                changes.push({
                    issueKey: issue.key,
                    summary: issue.fields.summary,
                    issueType: issue.fields.issuetype.name,
                    parentKey: issue.fields.parent?.key,
                    parentSummary: issue.fields.parent?.fields?.summary,
                    assignee: extractUser(issue)?.displayName || null,
                    type: 'added',
                    changeDate: issue.fields.created,
                    description: 'Issue created during sprint'
                });
            }
        }

        // 2. Check changelog for sprint additions or point changes
        if (issue.changelog && issue.changelog.histories) {
            for (const history of issue.changelog.histories) {
                const historyTime = Date.parse(history.created);
                // Skip changes on or before sprint start date (same day = part of planning)
                if (historyTime <= sprintStartDayEndTime) continue;

                for (const item of history.items) {
                    // Check if added to sprint (exact ID match to avoid substring false positives)
                    if (!wasAddedDuringSprint && (item.field === 'Sprint' || item.fieldId === 'customfield_10020')) {
                        const addedToThisSprint = sprintFieldContainsId(item.to, sprint.id) || item.toString?.includes(sprint.name);
                        if (addedToThisSprint) {
                            wasAddedDuringSprint = true;
                            changes.push({
                                issueKey: issue.key,
                                summary: issue.fields.summary,
                                issueType: issue.fields.issuetype.name,
                                parentKey: issue.fields.parent?.key,
                                parentSummary: issue.fields.parent?.fields?.summary,
                                assignee: extractUser(issue)?.displayName || null,
                                type: 'added',
                                changeDate: history.created,
                                description: `Added to sprint (previously: ${item.fromString || 'None'})`
                            });
                        }
                    }

                    // Check for point changes
                    if (isStoryPointField(item.fieldId, item.field)) {
                        const oldVal = item.fromString || '0';
                        const newVal = item.toString || '0';
                        // Ignore trivial changes like null -> 0 if they're equivalent in math terms
                        if (oldVal !== newVal && parseFloat(oldVal || '0') !== parseFloat(newVal || '0')) {
                            changes.push({
                                issueKey: issue.key,
                                summary: issue.fields.summary,
                                issueType: issue.fields.issuetype.name,
                                parentKey: issue.fields.parent?.key,
                                parentSummary: issue.fields.parent?.fields?.summary,
                                assignee: extractUser(issue)?.displayName || null,
                                type: 'points_changed',
                                changeDate: history.created,
                                oldValue: oldVal,
                                newValue: newVal,
                                description: `${item.field || 'Story Points'} changed from ${oldVal} to ${newVal}`
                            });
                        }
                    }
                }
            }
        }
    }

    // Sort changes newest first
    return changes.sort((a, b) => Date.parse(b.changeDate) - Date.parse(a.changeDate));
}

/**
 * Calculate sprint report data from sub-tasks.
 * 
 * - Filters to sub-tasks only (issuetype.subtask === true)
 * - Groups by status category (To Do / In Progress / Done)
 * - Computes carry-over (everything not Done)
 * - Breaks down per team member (ROSTER-DRIVEN when team info available)
 */
export async function calculateSprintReport(
    sprint: Sprint,
    issues: JiraIssue[],
    boardId?: number
): Promise<SprintReportData> {
    // Step 2: Separate Sub-tasks (which hold the actual completions)
    // Note: 'Sub-Chore' might not always have the boolean flag, so we check name explicitly
    const subtasks = issues.filter(issue =>
        issue.fields.issuetype.subtask === true ||
        issue.fields.issuetype.name.toLowerCase() === 'sub-chore'
    );

    console.log(`[SprintReport] Total issues: ${issues.length}, Sub-tasks: ${subtasks.length}`);

    const scopeChanges = calculateScopeChanges(sprint, subtasks);
    console.log(`[SprintReport] Detected ${scopeChanges.length} scope changes on sub-tasks.`);

    // Get team roster from DB (falls back to JSON)
    const teamInfo = boardId ? await getTeamByBoardIdFromDb(boardId) : null;

    // Aggregate by status category
    const statusMap = new Map<string, { points: number; count: number; issues: ReportIssue[] }>();
    // Aggregate per member (from issue assignees)
    const memberMap = new Map<string, {
        user: User;
        totalPoints: number;
        completedPoints: number;
        carryOverPoints: number;
        statusMap: Map<string, { points: number; count: number; issues: ReportIssue[] }>;
    }>();

    let totalPoints = 0;
    let completedPoints = 0;
    let carryOverPoints = 0;
    const carryOverIssues: ReportIssue[] = [];

    for (const issue of subtasks) {
        const points = getStoryPoints(issue);
        const statusCategory = getStatusCategory(issue);
        const statusName = getStatusName(issue);
        const user = extractUser(issue);
        const isDone = statusCategory === 'Done';

        // Build report issue
        const reportIssue: ReportIssue = {
            key: issue.key,
            summary: issue.fields.summary,
            status: statusName,
            statusCategory,
            points,
            assignee: user?.displayName || null,
        };

        // Aggregate overall status groups
        if (!statusMap.has(statusCategory)) {
            statusMap.set(statusCategory, { points: 0, count: 0, issues: [] });
        }
        const statusEntry = statusMap.get(statusCategory)!;
        statusEntry.points += points;
        statusEntry.count += 1;
        statusEntry.issues.push(reportIssue);

        // Aggregate totals
        totalPoints += points;
        if (isDone) {
            completedPoints += points;
        } else {
            carryOverPoints += points;
            carryOverIssues.push(reportIssue);
        }

        // Aggregate per member
        if (user) {
            if (!memberMap.has(user.accountId)) {
                memberMap.set(user.accountId, {
                    user,
                    totalPoints: 0,
                    completedPoints: 0,
                    carryOverPoints: 0,
                    statusMap: new Map(),
                });
            }
            const memberEntry = memberMap.get(user.accountId)!;
            memberEntry.totalPoints += points;
            if (isDone) {
                memberEntry.completedPoints += points;
            } else {
                memberEntry.carryOverPoints += points;
            }

            if (!memberEntry.statusMap.has(statusCategory)) {
                memberEntry.statusMap.set(statusCategory, { points: 0, count: 0, issues: [] });
            }
            const memberStatusEntry = memberEntry.statusMap.get(statusCategory)!;
            memberStatusEntry.points += points;
            memberStatusEntry.count += 1;
            memberStatusEntry.issues.push(reportIssue);
        }
    }

    // Build status groups array (sorted: Done, In Progress, To Do, then others)
    const statusOrder = ['Done', 'In Progress', 'To Do'];
    const statusGroups: StatusGroup[] = Array.from(statusMap.entries())
        .sort((a, b) => {
            const aIdx = statusOrder.indexOf(a[0]);
            const bIdx = statusOrder.indexOf(b[0]);
            return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
        })
        .map(([category, data]) => ({
            statusCategory: category,
            points: data.points,
            count: data.count,
            issues: data.issues,
        }));

    // === ROSTER-DRIVEN MEMBER BREAKDOWNS ===
    // Build from roster members first, then add non-roster assignees.
    const memberBreakdowns: MemberBreakdown[] = [];
    const processedAccountIds = new Set<string>();

    const buildMemberStatusGroups = (sm: Map<string, { points: number; count: number; issues: ReportIssue[] }>): StatusGroup[] => {
        return Array.from(sm.entries())
            .sort((a, b) => {
                const aIdx = statusOrder.indexOf(a[0]);
                const bIdx = statusOrder.indexOf(b[0]);
                return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
            })
            .map(([category, data]) => ({
                statusCategory: category,
                points: data.points,
                count: data.count,
                issues: data.issues,
            }));
    };

    // Process roster members first (ensures member list matches team roster)
    if (teamInfo) {
        for (const rosterMember of teamInfo.config.members) {
            processedAccountIds.add(rosterMember.accountId);

            const issueData = memberMap.get(rosterMember.accountId);
            const memberTotalPoints = issueData?.totalPoints || 0;
            const memberCompletedPoints = issueData?.completedPoints || 0;
            const memberCarryOverPoints = issueData?.carryOverPoints || 0;
            const memberStatusMap = issueData?.statusMap || new Map();

            // Use Jira user info if available (has avatar), else use roster data
            const user: User = issueData?.user || {
                accountId: rosterMember.accountId,
                displayName: rosterMember.name,
                emailAddress: rosterMember.email,
                avatarUrl: '',
            };

            memberBreakdowns.push({
                user,
                role: rosterMember.role as 'qa' | 'engineer',
                title: rosterMember.title,
                totalPoints: memberTotalPoints,
                completedPoints: memberCompletedPoints,
                carryOverPoints: memberCarryOverPoints,
                completionPercent: memberTotalPoints > 0
                    ? (memberCompletedPoints / memberTotalPoints) * 100
                    : 0,
                statusGroups: buildMemberStatusGroups(memberStatusMap),
            });
        }
    }

    // Add non-roster assignees (people with issues but not in the roster)
    for (const [accountId, entry] of memberMap) {
        if (processedAccountIds.has(accountId)) continue;

        // Fall back to static JSON for role/title
        const memberInfo = getMemberByAccountId(accountId);
        const role = memberInfo?.member.role || 'engineer';
        const title = memberInfo?.member.title || 'Associate';

        memberBreakdowns.push({
            user: entry.user,
            role: role as 'qa' | 'engineer',
            title,
            totalPoints: entry.totalPoints,
            completedPoints: entry.completedPoints,
            carryOverPoints: entry.carryOverPoints,
            completionPercent: entry.totalPoints > 0
                ? (entry.completedPoints / entry.totalPoints) * 100
                : 0,
            statusGroups: buildMemberStatusGroups(entry.statusMap),
        });
    }

    // Sort: by total points descending
    memberBreakdowns.sort((a, b) => b.totalPoints - a.totalPoints);

    const completionPercent = totalPoints > 0
        ? (completedPoints / totalPoints) * 100
        : 0;

    // ─── SP Estimation Accuracy (worklog hours vs expected) ─────────
    const EXPECTED_HOURS_PER_SP = HOURS_PER_MANDAY;

    // Aggregate worklog hours per member for completed sub-tasks
    const memberWorklogMap = new Map<string, { name: string; role: 'qa' | 'engineer'; completedPoints: number; worklogHours: number }>();

    for (const issue of subtasks) {
        const isDone = getStatusCategory(issue) === 'Done';
        if (!isDone) continue;

        const user = extractUser(issue);
        if (!user) continue;

        const pts = getStoryPoints(issue);
        const worklogs = issue.fields.worklog?.worklogs || [];
        const issueHours = worklogs.reduce((sum, wl) => sum + (wl.timeSpentSeconds || 0) / 3600, 0);

        if (!memberWorklogMap.has(user.accountId)) {
            const memberInfo = getMemberByAccountId(user.accountId);
            memberWorklogMap.set(user.accountId, {
                name: user.displayName,
                role: (memberInfo?.member.role || 'engineer') as 'qa' | 'engineer',
                completedPoints: 0,
                worklogHours: 0,
            });
        }
        const entry = memberWorklogMap.get(user.accountId)!;
        entry.completedPoints += pts;
        entry.worklogHours += issueHours;
    }

    const spAccuracyMembers: SpAccuracyEntry[] = Array.from(memberWorklogMap.values())
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

    const teamCompletedPts = spAccuracyMembers.reduce((s, m) => s + m.completedPoints, 0);
    const teamWorklogHrs = spAccuracyMembers.reduce((s, m) => s + m.worklogHours, 0);
    const teamAvgHoursPerSP = teamCompletedPts > 0 ? Math.round((teamWorklogHrs / teamCompletedPts) * 10) / 10 : null;
    const teamAccuracy = teamAvgHoursPerSP && teamAvgHoursPerSP > 0
        ? Math.round((EXPECTED_HOURS_PER_SP / teamAvgHoursPerSP) * 1000) / 10
        : null;

    const spAccuracy: SpAccuracy = {
        expectedHoursPerSP: EXPECTED_HOURS_PER_SP,
        teamCompletedPoints: teamCompletedPts,
        teamWorklogHours: Math.round(teamWorklogHrs * 10) / 10,
        teamAvgHoursPerSP,
        teamAccuracy,
        members: spAccuracyMembers,
    };

    return {
        sprint,
        totalPoints,
        completedPoints,
        carryOverPoints,
        completionPercent,
        statusGroups,
        memberBreakdowns,
        carryOverIssues,
        scopeChanges,
        spAccuracy,
    };
}
