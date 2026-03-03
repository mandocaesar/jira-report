import { JiraIssue, User, UserUtilization, Sprint, SprintSummary } from '@/types';
import { calculateWorkingDays } from './holiday-service';
import { getMemberByAccountId, getSprintLeave, getTeamByBoardIdFromDb, getAvailableDaysFromMap, getTitleDaysMapFromDb } from './team-roster';
import { prisma, isDatabaseAvailable } from './db';

/**
 * Extract story points from a Jira issue
 * Only use known story point fields - be careful of date fields!
 */
function getStoryPoints(issue: JiraIssue): number {
    // Only use verified story point field names
    // IMPORTANT: customfield_10026 is a DATE field, not story points!
    const storyPointsFields = [
        'customfield_10036', // Story Points (Bank Sinarmas instance)
        'customfield_10052', // QA Story Point
    ];

    for (const fieldName of storyPointsFields) {
        const value = issue.fields[fieldName];
        if (value !== undefined && value !== null && typeof value === 'number') {
            return value;
        }
    }

    return 0;
}

/**
 * Extract user information from a Jira issue
 */
function extractUser(issue: JiraIssue): User | null {
    if (!issue.fields.assignee) {
        return null;
    }

    const assignee = issue.fields.assignee;
    return {
        accountId: assignee.accountId,
        displayName: assignee.displayName,
        emailAddress: assignee.emailAddress,
        avatarUrl: assignee.avatarUrls['48x48'],
    };
}

/**
 * Categorize issue type into:
 * - Product: Default category (Story, Task, Sub-task, etc.)
 * - Technical Initiatives: Technical Initiative, Chore
 * - Incident: Incident, Bug, Defect
 */
function categorizeIssueType(typeName: string): string {
    const lowerType = typeName.toLowerCase();

    // Technical Initiatives
    if (lowerType.includes('technical') || lowerType === 'chore') {
        return 'Technical Initiatives';
    }

    // Incident
    if (lowerType === 'incident' || lowerType === 'bug' || lowerType === 'defect') {
        return 'Incident';
    }

    // Product (default)
    return 'Product';
}

/**
 * Group issues by assignee and sum their story points and collect work type stats.
 * 
 * Simple approach: count every issue's points directly to its assignee.
 * This ensures individual contributions are tracked correctly.
 * 
 * Categories: Product, Technical Initiatives, Incident
 */
function groupByUser(issues: JiraIssue[]): Map<string, { user: User; storyPoints: number; workTypeStats: Record<string, number> }> {
    const userMap = new Map<string, { user: User; storyPoints: number; workTypeStats: Record<string, number> }>();

    const addStats = (user: User, points: number, category: string) => {
        if (!userMap.has(user.accountId)) {
            userMap.set(user.accountId, {
                user,
                storyPoints: 0,
                workTypeStats: {
                    'Product': 0,
                    'Technical Initiatives': 0,
                    'Incident': 0
                }
            });
        }
        const entry = userMap.get(user.accountId)!;
        entry.storyPoints += points;
        entry.workTypeStats[category] = (entry.workTypeStats[category] || 0) + points;
    };

    // Count every issue's points to its assignee
    for (const issue of issues) {
        const points = getStoryPoints(issue);
        if (points <= 0) continue; // Skip issues with no points

        const user = extractUser(issue);
        if (!user) continue; // Skip unassigned issues

        const typeName = issue.fields.issuetype.name;
        const category = categorizeIssueType(typeName);
        addStats(user, points, category);
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
    // Calculate working days in the sprint
    const startDate = new Date(sprint.startDate);
    const endDate = new Date(sprint.endDate);
    const totalWorkingDays = await calculateWorkingDays(startDate, endDate);

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
    const userDataMap = groupByUser(issues);

    // Calculate utilization for each user
    const userUtilizations: UserUtilization[] = [];

    // Stats for QA and Engineers
    let qaCount = 0;
    let engineerCount = 0;
    let qaMandays = 0;
    let engineerMandays = 0;
    let qaStoryPoints = 0;
    let engineerStoryPoints = 0;
    let qaLeaveDays = 0;
    let engineerLeaveDays = 0;

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

            const leaveDays = getLeaveDays(member.accountId);
            const titleBaseDays = getAvailableDaysFromMap(member.title, titleDaysMap);
            const availableDays = Math.max(0, titleBaseDays - leaveDays);

            const utilizationPercent = availableDays > 0
                ? (storyPoints / availableDays) * 100
                : 0;

            userUtilizations.push({
                user,
                storyPoints,
                workingDays: getAvailableDaysFromMap(member.title, titleDaysMap),
                leaveDays,
                availableDays,
                utilizationPercent,
                status: getUtilizationStatus(utilizationPercent),
                role: member.role,
                title: member.title,
                workTypeStats,
                isUnrecognized: false,
            });

            // Aggregate overall work type stats
            for (const [type, points] of Object.entries(workTypeStats)) {
                totalWorkTypeStats[type] = (totalWorkTypeStats[type] || 0) + points;
            }

            // Aggregate stats by role (only roster members count toward capacity)
            if (member.role === 'qa') {
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
        const titleBaseDays = getAvailableDaysFromMap(title, titleDaysMap);
        const availableDays = Math.max(0, titleBaseDays - leaveDays);

        const utilizationPercent = availableDays > 0
            ? (storyPoints / availableDays) * 100
            : 0;

        userUtilizations.push({
            user,
            storyPoints,
            workingDays: getAvailableDaysFromMap(title, titleDaysMap),
            leaveDays,
            availableDays,
            utilizationPercent,
            status: getUtilizationStatus(utilizationPercent),
            role,
            title,
            workTypeStats,
            isUnrecognized: true,
        });

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

    // Calculate totals
    const totalStoryPoints = userUtilizations.reduce(
        (sum, u) => sum + u.storyPoints,
        0
    );

    // Team-level calculation
    const teamSize = userUtilizations.length;
    const totalMandays = qaMandays + engineerMandays;

    // Get adhoc days configuration (default 3 days total for the team)
    const adhocDays = parseInt(process.env.ADHOC_DAYS_PER_SPRINT || '3', 10);

    // Available capacity = total mandays - adhoc days
    const availableCapacity = Math.max(0, totalMandays - adhocDays);

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
        },
        engineerStats: {
            count: engineerCount,
            mandays: engineerMandays,
            storyPoints: engineerStoryPoints,
            leaveDays: engineerLeaveDays,
            workTypeStats: engineerWorkTypeStats,
        },
        workTypeStats: totalWorkTypeStats,
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
