import { NextRequest } from 'next/server';
import { apiSuccess, apiError } from '@/lib/api-helpers';
import { getTeamByBoardIdFromDb } from '@/lib/team-roster';
import { getHolidaysInRange, calculateWorkingDays, isWeekend, toLocalDateString } from '@/lib/holiday-service';
import { createJiraClient } from '@/lib/jira-client';
import { loadSprintCapacity, MemberCapacityDays } from '@/lib/capacity-engine';

interface SprintForecast {
    sprintId: number;
    sprintName: string;
    startDate: string;
    endDate: string;
    capacity: {
        totalEngineers: number;
        effectiveEngineers: number;
        totalManDays: number;
        forecastedPoints: number;
        workingDays: number;
        weekdaysInSprint: number;
        totalPossibleManDays: number;
        totalLeaveDays: number;
        adjustmentLoss: number;
        holidayCount: number;
        nonDevDayLoss: number;
    };
    engineers: Array<{
        accountId: string;
        name: string;
        capacity: number;
        reason?: string;
        leaveDays?: number;
        excluded?: boolean;
    }>;
    holidays?: Array<{
        date: string;
        name: string;
    }>;
    leaves?: Array<{
        name: string;
        leaveDays: number;
    }>;
    excludedMembers?: Array<{
        name: string;
    }>;
    stories?: Array<{
        key: string;
        summary: string;
        status: string;
        statusCategory: string;
        assignee: string | null;
        storyPoints: number;
        type: string;
    }>;
}

// GET /api/planning/forecast?boardId=xxx&months=6
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const boardIdParam = searchParams.get('boardId');
        const monthsParam = searchParams.get('months') || '6';

        if (!boardIdParam) {
            return apiError('boardId is required', 400);
        }

        const boardId = parseInt(boardIdParam);
        const months = parseInt(monthsParam);

        // Get team for this board (DB-first, falls back to static JSON)
        const teamData = await getTeamByBoardIdFromDb(boardId);
        if (!teamData) {
            return apiError('Team not found for board', 404);
        }
        const team = teamData.config;

        // Fetch active/future sprints via JiraClient
        const client = createJiraClient();
        const sprints = await client.getSprintsByState(boardId, 'active,future');

        // Filter sprints within the forecast horizon
        const now = new Date();
        const forecastEnd = new Date();
        forecastEnd.setMonth(forecastEnd.getMonth() + months);

        const relevantSprints = sprints.filter((sprint: any) => {
            if (!sprint.startDate) return false;
            const start = new Date(sprint.startDate);
            return start <= forecastEnd;
        });

        if (relevantSprints.length === 0) {
            return apiSuccess({ boardId, teamName: team.name, sprints: [], engineers: team.members.map((m) => ({ accountId: m.accountId, name: m.name })) });
        }

        // ── Fetch sprint issues in parallel ──
        const jiraClient = createJiraClient();
        const storyPointsFields = ['customfield_10036', 'customfield_10052'];
        const issuesBySprintId = new Map<number, any[]>();

        await Promise.all(
            relevantSprints.map(async (sprint: any) => {
                try {
                    const issues = await jiraClient.getSprintIssues(sprint.id, boardId);
                    // Filter to parent-level issues only (no subtasks)
                    const parentIssues = issues.filter(issue => !issue.fields.issuetype?.subtask);
                    issuesBySprintId.set(sprint.id, parentIssues);
                } catch {
                    issuesBySprintId.set(sprint.id, []);
                }
            })
        );

        // ── Batch holiday lookups upfront (display only — the engine below owns the math) ──
        const earliestStart = new Date(Math.min(...relevantSprints.map((s: any) => new Date(s.startDate).getTime())));
        const latestEnd = new Date(Math.max(...relevantSprints.map((s: any) => new Date(s.endDate).getTime())));
        const allHolidays = await getHolidaysInRange(earliestStart, latestEnd);

        // Days-only capacity engine: theoretical mandays per member, per sprint.
        // No batch fn on the engine (unlike the old pipeline) — a Promise.all loop is fine
        // since the forecast horizon is a handful of active/future sprints.
        //
        // loadSprintCapacity returns null when the DB is unavailable OR the board's team
        // isn't in the DB `Team` table (JSON-roster-only teams). getTeamByBoardIdFromDb above
        // already fell back to the JSON roster in that case, so we still owe those teams a
        // forecast — fall back to a plain working-days count (same fallback Home uses in
        // lib/utilization-calculator.ts) with no leave/allocation data (none exists outside
        // the DB) rather than collapsing every sprint to zero.
        const capacityBySprintId = new Map<number, Awaited<ReturnType<typeof loadSprintCapacity>>>();
        const fallbackWorkingDaysBySprintId = new Map<number, number>();
        await Promise.all(
            relevantSprints.map(async (sprint: any) => {
                const loaded = await loadSprintCapacity(sprint, { boardId });
                capacityBySprintId.set(sprint.id, loaded);
                if (!loaded) {
                    const fallbackDays = await calculateWorkingDays(new Date(sprint.startDate), new Date(sprint.endDate));
                    fallbackWorkingDaysBySprintId.set(sprint.id, fallbackDays);
                }
            })
        );

        // ── Process all sprints ──
        const forecasts: SprintForecast[] = relevantSprints.map((sprint: any) => {
            const sprintId = sprint.id;
            const sprintName = sprint.name;
            const startDate = new Date(sprint.startDate);
            const endDate = new Date(sprint.endDate);
            const startStr = toLocalDateString(startDate);
            const endStr = toLocalDateString(endDate);

            // Filter pre-fetched holidays for this sprint's range (display only)
            const sprintHolidays = allHolidays.filter(
                h => h.holiday_date >= startStr && h.holiday_date <= endStr
            );

            // Weekday count, holiday-agnostic — used only for the "total possible" breakdown display
            let weekdaysInSprint = 0;
            const current = new Date(startDate);
            while (current <= endDate) {
                if (!isWeekend(current)) weekdaysInSprint++;
                current.setDate(current.getDate() + 1);
            }

            const loaded = capacityBySprintId.get(sprintId) ?? null;
            const capacityDays = loaded?.capacity ?? null;

            const workingDays = capacityDays?.sprintWorkingDays ?? fallbackWorkingDaysBySprintId.get(sprintId) ?? 0;

            // members always carries the shape the loop below needs — sourced from the
            // engine when available, or synthesized from the roster (no leave/allocation
            // data outside the DB, so full working days at 100% for every member) when not.
            const members: MemberCapacityDays[] = capacityDays?.members ?? team.members.map((m) => ({
                accountId: m.accountId,
                name: m.name,
                role: m.role,
                title: m.title,
                excluded: false,
                sprintWorkingDays: workingDays,
                leaveDays: 0,
                allocationFactor: 1,
                theoreticalMandays: workingDays,
            }));

            const engineerDetails: SprintForecast['engineers'] = [];
            const leavesList: Array<{ name: string; leaveDays: number }> = [];
            const excludedList: Array<{ name: string }> = [];
            let totalLeaveDays = 0;
            let adjustmentLoss = 0;

            for (const m of members) {
                if (m.excluded) {
                    engineerDetails.push({ accountId: m.accountId, name: m.name, capacity: 0, excluded: true });
                    excludedList.push({ name: m.name });
                    continue;
                }

                const capacityPercent = Math.round(m.allocationFactor * 100);
                engineerDetails.push({ accountId: m.accountId, name: m.name, capacity: capacityPercent, leaveDays: m.leaveDays });
                totalLeaveDays += m.leaveDays;
                if (m.allocationFactor < 1) {
                    // Matches the engine's formula exactly: theoretical = max(0, sprintWorkingDays * f - leaveDays),
                    // i.e. leave is subtracted AFTER allocation is applied, at full weight — so the days lost
                    // purely to partial allocation is sprintWorkingDays * (1 - f), not (sprintWorkingDays - leave) * (1 - f).
                    adjustmentLoss += m.sprintWorkingDays * (1 - m.allocationFactor);
                }
                if (m.leaveDays > 0) leavesList.push({ name: m.name, leaveDays: m.leaveDays });
            }

            const totalManDays = members.reduce((s, m) => s + m.theoreticalMandays, 0);
            const totalEngineers = members.filter(m => !m.excluded).length;
            const effectiveEngineers = workingDays > 0 ? totalManDays / workingDays : 0;
            const pointsPerManDay = 1.8;
            const forecastedPoints = Math.floor(totalManDays * pointsPerManDay);

            const formattedHolidays = sprintHolidays
                .filter(h => !isWeekend(h.holiday_date))
                .map(h => ({ date: h.holiday_date, name: h.holiday_name }));

            const totalPossibleManDays = weekdaysInSprint * totalEngineers;
            const holidayCount = formattedHolidays.length;

            // Non-dev days are deducted inside sprintWorkingDays by the engine (weekday,
            // non-holiday dates only — a non-dev day that lands on a weekend or holiday is
            // already excluded by those checks and must not be double-counted here), but
            // weren't previously itemized in the breakdown, leaving an unexplained gap
            // between totalPossibleManDays and totalManDays. Surface it explicitly.
            const nonDevDates = loaded?.input.nonDevDates ?? new Set<string>();
            const engineHolidayDates = loaded?.input.holidayDates ?? new Set<string>();
            let nonDevDayCount = 0;
            for (const d of nonDevDates) {
                if (!isWeekend(d) && !engineHolidayDates.has(d)) nonDevDayCount++;
            }
            const nonDevDayLoss = nonDevDayCount * totalEngineers;

            return {
                sprintId,
                sprintName,
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                capacity: {
                    totalEngineers,
                    effectiveEngineers: Math.round(effectiveEngineers * 10) / 10,
                    totalManDays: Math.round(totalManDays * 10) / 10,
                    forecastedPoints,
                    workingDays,
                    weekdaysInSprint,
                    totalPossibleManDays,
                    totalLeaveDays,
                    adjustmentLoss: Math.round(adjustmentLoss * 100) / 100,
                    holidayCount,
                    nonDevDayLoss,
                },
                engineers: engineerDetails,
                holidays: formattedHolidays.length > 0 ? formattedHolidays : undefined,
                leaves: leavesList.length > 0 ? leavesList : undefined,
                excludedMembers: excludedList.length > 0 ? excludedList : undefined,
                stories: (() => {
                    const sprintIssues = issuesBySprintId.get(sprintId) || [];
                    if (sprintIssues.length === 0) return undefined;
                    return sprintIssues.map(issue => {
                        let sp = 0;
                        for (const f of storyPointsFields) {
                            const v = issue.fields[f];
                            if (v !== undefined && v !== null && typeof v === 'number') { sp = v; break; }
                        }
                        return {
                            key: issue.key,
                            summary: issue.fields.summary,
                            status: issue.fields.status?.name || 'Unknown',
                            statusCategory: issue.fields.status?.statusCategory?.name || 'Unknown',
                            assignee: issue.fields.assignee?.displayName || null,
                            storyPoints: sp,
                            type: issue.fields.issuetype?.name || 'Story',
                        };
                    });
                })(),
            };
        });

        return apiSuccess({
            boardId,
            teamName: team.name,
            sprints: forecasts,
            engineers: team.members.map((m) => ({
                accountId: m.accountId,
                name: m.name,
            })),
        });
    } catch (error) {
        console.error('Error generating forecast:', error);
        return apiError('Failed to generate forecast', 500);
    }
}
