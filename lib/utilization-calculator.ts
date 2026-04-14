import { JiraIssue, User, UserUtilization, Sprint, SprintSummary, UserIssue } from '@/types';
import { calculateWorkingDays, getHolidaysInRange } from './holiday-service';
import { getMemberByAccountId, getSprintLeave, getTeamByBoardIdFromDb, getAvailableDaysFromMap, getTitleDaysMapFromDb } from './team-roster';
import { prisma, isDatabaseAvailable } from './db';
import { getStoryPoints, extractUser, categorizeIssueType, sprintFieldContainsId } from './issue-helpers';

/**
 * Group issues by assignee and sum their story points and collect work type stats.
 * 
 * Simple approach: count every issue's points directly to its assignee.
 * This ensures individual contributions are tracked correctly.
 * 
 * Categories: Product, Technical Initiatives, Incident
 */
function groupByUser(issues: JiraIssue[], sprint: Sprint): Map<string, { user: User; storyPoints: number; workTypeStats: Record<string, number>; issues: UserIssue[] }> {
    const userMap = new Map<string, { user: User; storyPoints: number; workTypeStats: Record<string, number>; issues: UserIssue[] }>();

    // Pre-compute sprint start boundary for scope change detection
    const sprintStartDayEnd = new Date(sprint.startDate);
    sprintStartDayEnd.setHours(23, 59, 59, 999);
    const sprintStartDayEndTime = sprintStartDayEnd.getTime();

    const isAddedDuringSprint = (issue: JiraIssue): { added: boolean; daysAfter: number } => {
        // Check if created after sprint start day
        if (issue.fields.created) {
            const createdTime = Date.parse(issue.fields.created);
            if (createdTime > sprintStartDayEndTime) {
                const days = Math.ceil((createdTime - sprintStartDayEndTime) / (1000 * 60 * 60 * 24));
                return { added: true, daysAfter: days };
            }
        }
        // Check changelog for sprint field changes
        if (issue.changelog?.histories) {
            for (const history of issue.changelog.histories) {
                const historyTime = Date.parse(history.created);
                if (historyTime <= sprintStartDayEndTime) continue;
                for (const item of history.items) {
                    if (item.field === 'Sprint' || item.fieldId === 'customfield_10020') {
                        if (sprintFieldContainsId(item.to, sprint.id) || item.toString?.includes(sprint.name)) {
                            const days = Math.ceil((historyTime - sprintStartDayEndTime) / (1000 * 60 * 60 * 24));
                            return { added: true, daysAfter: days };
                        }
                    }
                }
            }
        }
        return { added: false, daysAfter: 0 };
    };

    const addStats = (user: User, points: number, category: string, issue: JiraIssue) => {
        if (!userMap.has(user.accountId)) {
            userMap.set(user.accountId, {
                user,
                storyPoints: 0,
                workTypeStats: {
                    'Product': 0,
                    'Technical Initiatives': 0,
                    'Incident': 0
                },
                issues: []
            });
        }
        const entry = userMap.get(user.accountId)!;
        entry.storyPoints += points;
        entry.workTypeStats[category] = (entry.workTypeStats[category] || 0) + points;
        entry.issues.push({
            key: issue.key,
            summary: issue.fields.summary,
            issueType: issue.fields.issuetype.name,
            status: issue.fields.status?.name || 'Unknown',
            statusCategory: issue.fields.status?.statusCategory?.name || 'Unknown',
            points,
            category: category as UserIssue['category'],
            parentKey: issue.fields.parent?.key,
            parentSummary: issue.fields.parent?.fields?.summary,
            ...(() => { const r = isAddedDuringSprint(issue); return { addedDuringSprint: r.added, addedDaysAfterStart: r.daysAfter || undefined }; })(),
        });
    };

    // Build a set of issue keys that are sub-tasks (have a parent in the sprint).
    // Then: skip any parent issue that has sub-tasks present in the sprint.
    const subtaskParentKeys = new Set<string>();
    for (const issue of issues) {
        if (issue.fields.issuetype.subtask && issue.fields.parent?.key) {
            subtaskParentKeys.add(issue.fields.parent.key);
        }
    }

    for (const issue of issues) {
        // Skip parent issues whose sub-tasks are in the sprint
        if (!issue.fields.issuetype.subtask && subtaskParentKeys.has(issue.key)) continue;

        const points = getStoryPoints(issue);
        if (points <= 0) continue; // Skip issues with no points

        const user = extractUser(issue);
        if (!user) continue; // Skip unassigned issues

        const typeName = issue.fields.issuetype.name;
        const category = categorizeIssueType(typeName);
        addStats(user, points, category, issue);
    }

    return userMap;
}

/**
 * Determine utilization status based on percentage
 */
function getUtilizationStatus(percent: number): 'under' | 'optimal' | 'over' {
    if (percent < 70) return 'under';
    if (percent > 110) return 'over';
    return 'optimal';
}

/**
 * Fetch leave data for a sprint from the database, falling back to static JSON
 */
async function fetchSprintLeaveMap(sprintId: number): Promise<Record<string, number>> {
    const leaveMap: Record<string, number> = {};

    if (isDatabaseAvailable() && prisma) {
        try {
            const leaveEntries = await prisma.sprintLeave.findMany({
                where: { sprintId },
            });
            for (const entry of leaveEntries) {
                leaveMap[entry.accountId] = entry.leaveDays;
            }
            return leaveMap;
        } catch (error) {
            console.warn('Failed to fetch leave from database, falling back to static config:', error);
        }
    }

    // Fallback: return empty map (static JSON getSprintLeave will be used per-user)
    return leaveMap;
}

/**
 * Calculate utilization for all users in a sprint
 */
export async function calculateSprintUtilization(
    sprint: Sprint,
    issues: JiraIssue[],
    boardId?: number
): Promise<SprintSummary> {
    // Calculate working days and fetch holidays
    const startDate = new Date(sprint.startDate);
    const endDate = new Date(sprint.endDate);
    const [totalWorkingDays, holidays] = await Promise.all([
        calculateWorkingDays(startDate, endDate),
        getHolidaysInRange(startDate, endDate)
    ]);

    // Get team info from DB if board ID is provided (falls back to JSON)
    const teamInfo = boardId ? await getTeamByBoardIdFromDb(boardId) : null;

    // Get title available days map from DB (falls back to JSON)
    const titleDaysMap = await getTitleDaysMapFromDb();

    // Fetch leave data from database (or fallback to static)
    const dbLeaveMap = await fetchSprintLeaveMap(sprint.id);
    const hasDbLeave = Object.keys(dbLeaveMap).length > 0;

    // Helper to get leave days: prefer DB data, fallback to static JSON
    const getLeaveDays = (accountId: string): number => {
        if (hasDbLeave) {
            return dbLeaveMap[accountId] || 0;
        }
        return getSprintLeave(sprint.id, accountId);
    };

    // Group issues by user
    const userDataMap = groupByUser(issues, sprint);

    // Calculate utilization for each user
    const userUtilizations: UserUtilization[] = [];

    // Team standard hours (from DB team or default 8)
    const teamStandardHours = teamInfo?.config.workingHoursPerDay ?? 8;

    // Stats for QA and Engineers
    let qaCount = 0;
    let engineerCount = 0;
    let qaMandays = 0;
    let engineerMandays = 0;
    let qaStoryPoints = 0;
    let engineerStoryPoints = 0;
    let qaLeaveDays = 0;
    let engineerLeaveDays = 0;
    let qaTotalHours = 0;
    let engineerTotalHours = 0;
    let qaEffectiveMandays = 0;
    let engineerEffectiveMandays = 0;
    let totalStoryPoints = 0;

    // Work type stats by role
    const qaWorkTypeStats: Record<string, number> = { 'Product': 0, 'Technical Initiatives': 0, 'Incident': 0 };
    const engineerWorkTypeStats: Record<string, number> = { 'Product': 0, 'Technical Initiatives': 0, 'Incident': 0 };

    // Overall work type stats
    const totalWorkTypeStats: Record<string, number> = {};

    // Track which roster members have been processed
    const processedAccountIds = new Set<string>();

    // Build a member lookup map from team info (DB preferred, static JSON fallback)
    const teamMemberMap = new Map<string, { role: 'qa' | 'engineer'; title: string; name: string; email: string }>();
    if (teamInfo) {
        for (const member of teamInfo.config.members) {
            teamMemberMap.set(member.accountId, { role: member.role, title: member.title, name: member.name, email: member.email });
        }
    }

    // === ROSTER-DRIVEN APPROACH ===
    // Process roster members FIRST to ensure member counts and mandays always match the roster.
    // Then handle non-roster assignees separately (their points count but don't affect capacity).

    if (teamInfo) {
        for (const member of teamInfo.config.members) {
            processedAccountIds.add(member.accountId);

            // Check if this roster member has any sprint issues
            const issueData = userDataMap.get(member.accountId);
            const storyPoints = issueData?.storyPoints || 0;
            const workTypeStats = issueData?.workTypeStats || { 'Product': 0, 'Technical Initiatives': 0, 'Incident': 0 };

            // Use Jira user info if available (has avatar), else use roster data
            const user: User = issueData?.user || {
                accountId: member.accountId,
                displayName: member.name,
                emailAddress: member.email,
                avatarUrl: '',
            };

            const rawLeaveDays = getLeaveDays(member.accountId);
            const isExcluded = rawLeaveDays === -1;
            const leaveDays = isExcluded ? 0 : rawLeaveDays;
            const titleBaseDays = Math.min(getAvailableDaysFromMap(member.title, titleDaysMap), totalWorkingDays);
            const availableDays = isExcluded ? 0 : Math.max(0, titleBaseDays - leaveDays);

            // Hours-based capacity
            const resolvedHours = member.workingHoursPerDay ?? teamStandardHours;
            const availableHours = availableDays * resolvedHours;
            const effectiveMandays = teamStandardHours > 0
                ? availableHours / teamStandardHours
                : availableDays;

            const utilizationPercent = effectiveMandays > 0
                ? (storyPoints / effectiveMandays) * 100
                : 0;

            userUtilizations.push({
                user,
                storyPoints,
                workingDays: isExcluded ? 0 : titleBaseDays,
                leaveDays,
                availableDays,
                utilizationPercent,
                status: getUtilizationStatus(utilizationPercent),
                role: member.role,
                title: member.title,
                workTypeStats,
                isUnrecognized: false,
                workingHoursPerDay: resolvedHours,
                teamStandardHours,
                availableHours,
                effectiveMandays,
                issues: issueData?.issues || [],
            });
            totalStoryPoints += storyPoints;

            // Aggregate overall work type stats
            for (const [type, points] of Object.entries(workTypeStats)) {
                totalWorkTypeStats[type] = (totalWorkTypeStats[type] || 0) + points;
            }

            // Aggregate stats by role (only non-excluded roster members count toward capacity)
            if (!isExcluded) {
                if (member.role === 'qa') {
                    qaCount++;
                    qaMandays += availableDays;
                    qaStoryPoints += storyPoints;
                    qaLeaveDays += leaveDays;
                    qaTotalHours += availableHours;
                    qaEffectiveMandays += effectiveMandays;
                    for (const [type, points] of Object.entries(workTypeStats)) {
                        qaWorkTypeStats[type] = (qaWorkTypeStats[type] || 0) + points;
                    }
                } else {
                    engineerCount++;
                    engineerMandays += availableDays;
                    engineerStoryPoints += storyPoints;
                    engineerLeaveDays += leaveDays;
                    engineerTotalHours += availableHours;
                    engineerEffectiveMandays += effectiveMandays;
                    for (const [type, points] of Object.entries(workTypeStats)) {
                        engineerWorkTypeStats[type] = (engineerWorkTypeStats[type] || 0) + points;
                    }
                }
            }
        }
    }

    // === NON-ROSTER ASSIGNEES ===
    // People who have sprint issues but aren't in the team roster.
    // Their story points are tracked but they DON'T count toward team capacity (member counts, mandays).
    for (const { user, storyPoints, workTypeStats } of userDataMap.values()) {
        if (processedAccountIds.has(user.accountId)) continue;

        // If no teamInfo at all, fall back to static JSON lookup for role/title
        const memberInfo = getMemberByAccountId(user.accountId);
        const role = memberInfo?.member.role || 'engineer';
        const title = memberInfo?.member.title || 'Associate';

        const leaveDays = getLeaveDays(user.accountId);
        const titleBaseDays = Math.min(getAvailableDaysFromMap(title, titleDaysMap), totalWorkingDays);
        const availableDays = Math.max(0, titleBaseDays - leaveDays);

        // Non-roster: assume team standard hours
        const resolvedHours = teamStandardHours;
        const availableHours = availableDays * resolvedHours;
        const effectiveMandays = teamStandardHours > 0
            ? availableHours / teamStandardHours
            : availableDays;

        const utilizationPercent = effectiveMandays > 0
            ? (storyPoints / effectiveMandays) * 100
            : 0;

        userUtilizations.push({
            user,
            storyPoints,
            workingDays: titleBaseDays,
            leaveDays,
            availableDays,
            utilizationPercent,
            status: getUtilizationStatus(utilizationPercent),
            role,
            title,
            workTypeStats,
            isUnrecognized: true,
            workingHoursPerDay: resolvedHours,
            teamStandardHours,
            availableHours,
            effectiveMandays,
            issues: userDataMap.get(user.accountId)?.issues || [],
        });
        totalStoryPoints += storyPoints;

        // Non-roster points still count in overall work type stats
        for (const [type, points] of Object.entries(workTypeStats)) {
            totalWorkTypeStats[type] = (totalWorkTypeStats[type] || 0) + points;
        }

        // If there's no team info at all (no DB, no JSON match), count them normally
        if (!teamInfo) {
            if (role === 'qa') {
                qaCount++;
                qaMandays += availableDays;
                qaStoryPoints += storyPoints;
                qaLeaveDays += leaveDays;
                for (const [type, points] of Object.entries(workTypeStats)) {
                    qaWorkTypeStats[type] = (qaWorkTypeStats[type] || 0) + points;
                }
            } else {
                engineerCount++;
                engineerMandays += availableDays;
                engineerStoryPoints += storyPoints;
                engineerLeaveDays += leaveDays;
                for (const [type, points] of Object.entries(workTypeStats)) {
                    engineerWorkTypeStats[type] = (engineerWorkTypeStats[type] || 0) + points;
                }
            }
        }
    }

    // Sort by utilization percentage (descending)
    userUtilizations.sort((a, b) => b.utilizationPercent - a.utilizationPercent);

    // Team-level calculation
    const teamSize = userUtilizations.length;
    const totalMandays = qaMandays + engineerMandays;
    const totalHours = qaTotalHours + engineerTotalHours;
    const totalEffectiveMandays = qaEffectiveMandays + engineerEffectiveMandays;

    // Get adhoc days configuration (default 3 days total for the team)
    const adhocDays = parseInt(process.env.ADHOC_DAYS_PER_SPRINT || '3', 10);

    // Available capacity = total effective mandays - adhoc days
    const availableCapacity = Math.max(0, totalEffectiveMandays - adhocDays);

    // Team average utilization = total story points / available capacity
    const averageUtilization = availableCapacity > 0
        ? (totalStoryPoints / availableCapacity) * 100
        : 0;

    return {
        sprint,
        totalStoryPoints,
        totalWorkingDays,
        averageUtilization,
        userUtilizations,
        qaStats: {
            count: qaCount,
            mandays: qaMandays,
            storyPoints: qaStoryPoints,
            leaveDays: qaLeaveDays,
            workTypeStats: qaWorkTypeStats,
            totalHours: qaTotalHours,
            effectiveMandays: qaEffectiveMandays,
        },
        engineerStats: {
            count: engineerCount,
            mandays: engineerMandays,
            storyPoints: engineerStoryPoints,
            leaveDays: engineerLeaveDays,
            workTypeStats: engineerWorkTypeStats,
            totalHours: engineerTotalHours,
            effectiveMandays: engineerEffectiveMandays,
        },
        workTypeStats: totalWorkTypeStats,
        holidays,
        teamStandardHours,
        totalAvailableHours: totalHours,
        totalEffectiveMandays,
    };
}

/**
 * Calculate total mandays for a sprint
 * This is the sum of all working days available to all team members
 */
export function calculateTotalMandays(
    workingDays: number,
    teamSize: number
): number {
    return workingDays * teamSize;
}
