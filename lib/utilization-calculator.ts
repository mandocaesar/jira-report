import { JiraIssue, User, UserUtilization, Sprint, SprintSummary, UserIssue } from '@/types';
import { calculateWorkingDays, getHolidaysInRange } from './holiday-service';
import { getMemberByAccountId, getTeamByBoardIdFromDb } from './team-roster';
import { getStoryPoints, extractUser, categorizeIssueType, sprintFieldContainsId } from './issue-helpers';
import { loadSprintCapacity } from './capacity-engine';
import { computeAssignment, computeBufferReport } from './sprint-assignment';

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

/** Accumulate work type stats from source into target */
function addWorkTypeStats(target: Record<string, number>, source: Record<string, number>) {
    for (const [type, points] of Object.entries(source)) {
        target[type] = (target[type] || 0) + points;
    }
}

/**
 * Calculate utilization for all users in a sprint
 */
export async function calculateSprintUtilization(
    sprint: Sprint,
    issues: JiraIssue[],
    boardId?: number
): Promise<SprintSummary> {
    // Calculate working days and fetch holidays (fallback total for DB-less mode)
    const startDate = new Date(sprint.startDate);
    const endDate = new Date(sprint.endDate);
    const [fallbackTotalWorkingDays, holidays] = await Promise.all([
        calculateWorkingDays(startDate, endDate),
        getHolidaysInRange(startDate, endDate)
    ]);

    // Get team info from DB if board ID is provided (falls back to JSON)
    const teamInfo = boardId ? await getTeamByBoardIdFromDb(boardId) : null;

    // Days-only capacity engine: theoretical mandays per member + SP assignment split
    const [loaded, assignment] = await Promise.all([
        boardId ? loadSprintCapacity(sprint, { boardId }) : Promise.resolve(null),
        Promise.resolve(computeAssignment(sprint, issues)),
    ]);
    const capacity = loaded?.capacity ?? null;
    const capacityByAccount = new Map(capacity?.members.map(m => [m.accountId, m]) ?? []);
    const totalWorkingDays = capacity?.sprintWorkingDays ?? fallbackTotalWorkingDays;

    // Group issues by user
    const userDataMap = groupByUser(issues, sprint);

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

            const cap = capacityByAccount.get(member.accountId);
            const memberAssign = assignment.perMember.get(member.accountId);
            const theoretical = cap?.theoreticalMandays ?? 0;
            const assignedAtStart = memberAssign?.assignedAtStart ?? 0;
            const isExcluded = cap?.excluded ?? false;
            const workingDays = cap?.sprintWorkingDays ?? 0;
            const leaveDays = cap?.leaveDays ?? 0;
            const availableDays = theoretical;

            const utilizationPercent = theoretical > 0
                ? (assignedAtStart / theoretical) * 100
                : 0;

            userUtilizations.push({
                user,
                storyPoints,
                workingDays,
                leaveDays,
                availableDays,
                utilizationPercent,
                status: getUtilizationStatus(utilizationPercent),
                role: member.role,
                title: member.title,
                workTypeStats,
                isUnrecognized: false,
                workingHoursPerDay: 0,
                teamStandardHours: 0,
                availableHours: 0,
                effectiveMandays: theoretical,
                issues: issueData?.issues || [],
            });
            totalStoryPoints += storyPoints;
            addWorkTypeStats(totalWorkTypeStats, workTypeStats);

            // Aggregate stats by role (only non-excluded roster members count toward capacity)
            if (!isExcluded) {
                if (member.role === 'qa') {
                    qaCount++;
                    qaMandays += availableDays;
                    qaStoryPoints += storyPoints;
                    qaLeaveDays += leaveDays;
                    qaEffectiveMandays += theoretical;
                    addWorkTypeStats(qaWorkTypeStats, workTypeStats);
                } else {
                    engineerCount++;
                    engineerMandays += availableDays;
                    engineerStoryPoints += storyPoints;
                    engineerLeaveDays += leaveDays;
                    engineerEffectiveMandays += theoretical;
                    addWorkTypeStats(engineerWorkTypeStats, workTypeStats);
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

        // Non-roster assignees aren't part of the capacity engine's team roster,
        // so there's no per-member leave/theoretical data for them — leave is
        // untracked (0) and working days fall back to the sprint-wide total.
        const workingDays = capacity?.sprintWorkingDays ?? totalWorkingDays;
        const leaveDays = 0;
        const availableDays = Math.max(0, workingDays - leaveDays);

        const utilizationPercent = availableDays > 0
            ? (storyPoints / availableDays) * 100
            : 0;

        userUtilizations.push({
            user,
            storyPoints,
            workingDays,
            leaveDays,
            availableDays,
            utilizationPercent,
            status: getUtilizationStatus(utilizationPercent),
            role,
            title,
            workTypeStats,
            isUnrecognized: true,
            workingHoursPerDay: 0,
            teamStandardHours: 0,
            availableHours: 0,
            effectiveMandays: availableDays,
            issues: userDataMap.get(user.accountId)?.issues || [],
        });
        totalStoryPoints += storyPoints;
        addWorkTypeStats(totalWorkTypeStats, workTypeStats);

        // If there's no team info at all (no DB, no JSON match), count them normally
        if (!teamInfo) {
            if (role === 'qa') {
                qaCount++;
                qaMandays += availableDays;
                qaStoryPoints += storyPoints;
                qaLeaveDays += leaveDays;
                addWorkTypeStats(qaWorkTypeStats, workTypeStats);
            } else {
                engineerCount++;
                engineerMandays += availableDays;
                engineerStoryPoints += storyPoints;
                engineerLeaveDays += leaveDays;
                addWorkTypeStats(engineerWorkTypeStats, workTypeStats);
            }
        }
    }

    // Sort by utilization percentage (descending)
    userUtilizations.sort((a, b) => b.utilizationPercent - a.utilizationPercent);

    // Team-level calculation
    const totalMandays = qaMandays + engineerMandays;
    const totalHours = qaTotalHours + engineerTotalHours;

    // Days-only capacity engine buffer readout (null when capacity engine unavailable, e.g. no DB/team)
    const buffer = capacity ? computeBufferReport(capacity, assignment) : null;
    const totalEffectiveMandays = buffer?.theoreticalMandays ?? 0;

    // Team average utilization = team assigned-at-start ÷ team theoretical mandays
    const averageUtilization = buffer && buffer.theoreticalMandays > 0
        ? (buffer.assignedAtStart / buffer.theoreticalMandays) * 100
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
        teamStandardHours: 0,
        totalAvailableHours: totalHours,
        totalEffectiveMandays,
        buffer,
    };
}

/**
 * Compute aggregated stats for a given role from userUtilizations.
 * Use this instead of pre-materialized qaStats/engineerStats.
 */
export function computeRoleStats(userUtilizations: UserUtilization[], role: 'qa' | 'engineer') {
    const members = userUtilizations.filter(u => u.role === role);
    const workTypeStats: Record<string, number> = {};
    let mandays = 0, storyPoints = 0, leaveDays = 0, totalHours = 0, effectiveMandays = 0;

    for (const m of members) {
        mandays += m.availableDays;
        storyPoints += m.storyPoints;
        leaveDays += m.leaveDays;
        totalHours += m.availableHours;
        effectiveMandays += m.effectiveMandays;
        if (m.workTypeStats) {
            for (const [type, pts] of Object.entries(m.workTypeStats)) {
                workTypeStats[type] = (workTypeStats[type] || 0) + pts;
            }
        }
    }

    return { count: members.length, mandays, storyPoints, leaveDays, workTypeStats, totalHours, effectiveMandays };
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
