import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getTeamByBoardIdFromDb } from '@/lib/team-roster';
import { getHolidaysInRange, isWeekend, toLocalDateString } from '@/lib/holiday-service';

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
}

// GET /api/planning/forecast?boardId=xxx&months=6
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const boardIdParam = searchParams.get('boardId');
        const monthsParam = searchParams.get('months') || '6';

        if (!boardIdParam) {
            return NextResponse.json(
                { success: false, error: 'boardId is required' },
                { status: 400 }
            );
        }

        const boardId = parseInt(boardIdParam);
        const months = parseInt(monthsParam);

        // Get team for this board (DB-first, falls back to static JSON)
        const teamData = await getTeamByBoardIdFromDb(boardId);
        if (!teamData) {
            return NextResponse.json(
                { success: false, error: 'Team not found for board' },
                { status: 404 }
            );
        }
        const team = teamData.config;

        // Fetch active sprints from Jira API
        const jiraDomain = process.env.JIRA_DOMAIN;
        const jiraEmail = process.env.JIRA_EMAIL;
        const jiraToken = process.env.JIRA_API_TOKEN;

        const sprintsResponse = await fetch(
            `https://${jiraDomain}/rest/agile/1.0/board/${boardId}/sprint?state=active,future&maxResults=50`,
            {
                headers: {
                    Authorization: `Basic ${Buffer.from(`${jiraEmail}:${jiraToken}`).toString('base64')}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (!sprintsResponse.ok) {
            throw new Error('Failed to fetch sprints from Jira');
        }

        const sprintsData = await sprintsResponse.json();
        const sprints = sprintsData.values || [];

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
            return NextResponse.json({
                success: true,
                data: { boardId, teamName: team.name, sprints: [], engineers: team.members.map((m) => ({ accountId: m.accountId, name: m.name })) },
            });
        }

        // ── Batch all data upfront instead of per-sprint ──

        // 1. Compute the overall date range across all sprints
        const earliestStart = new Date(Math.min(...relevantSprints.map((s: any) => new Date(s.startDate).getTime())));
        const latestEnd = new Date(Math.max(...relevantSprints.map((s: any) => new Date(s.endDate).getTime())));
        const allSprintIds = relevantSprints.map((s: any) => s.id as number);

        // 2. Batch DB queries + holiday fetch in parallel
        const [allCapacityAdjustments, allLeaveData, allHolidays] = await Promise.all([
            // Single query for all capacity adjustments covering any sprint in range
            prisma ? prisma.engineerCapacity.findMany({
                where: { startDate: { lte: latestEnd }, endDate: { gte: earliestStart } },
            }).catch(() => []) : Promise.resolve([]),
            // Single query for all leave data across all sprint IDs
            prisma ? prisma.sprintLeave.findMany({
                where: { sprintId: { in: allSprintIds } },
            }).catch(() => []) : Promise.resolve([]),
            // Single holiday fetch for entire range (cache will handle dedup)
            getHolidaysInRange(earliestStart, latestEnd),
        ]);

        // Index leave data by sprintId for O(1) lookup
        const leaveBySprintId = new Map<number, typeof allLeaveData>();
        for (const leave of allLeaveData) {
            const arr = leaveBySprintId.get(leave.sprintId) || [];
            arr.push(leave);
            leaveBySprintId.set(leave.sprintId, arr);
        }

        // ── Process all sprints (no more async per-sprint) ──
        const forecasts: SprintForecast[] = relevantSprints.map((sprint: any) => {
            const sprintId = sprint.id;
            const sprintName = sprint.name;
            const startDate = new Date(sprint.startDate);
            const endDate = new Date(sprint.endDate);
            const startStr = toLocalDateString(startDate);
            const endStr = toLocalDateString(endDate);

            // Filter pre-fetched capacity adjustments for this sprint's date range
            const capacityAdjustments = allCapacityAdjustments.filter(
                (adj: any) => new Date(adj.startDate) <= endDate && new Date(adj.endDate) >= startDate
            );

            // Get leave data for this sprint from indexed map
            const leaveData = leaveBySprintId.get(sprintId) || [];

            // Filter pre-fetched holidays for this sprint's range
            const sprintHolidays = allHolidays.filter(
                h => h.holiday_date >= startStr && h.holiday_date <= endStr
            );

            // Count working days from pre-fetched holidays (no async needed)
            let workingDays = 0;
            const current = new Date(startDate);
            while (current <= endDate) {
                const dateStr = toLocalDateString(current);
                if (!isWeekend(current) && !sprintHolidays.some(h => h.holiday_date === dateStr)) {
                    workingDays++;
                }
                current.setDate(current.getDate() + 1);
            }

            let totalManDays = 0;
            const engineerDetails: any[] = [];
            const leavesList: Array<{ name: string; leaveDays: number }> = [];
            const excludedList: Array<{ name: string }> = [];
            let activeEngineers = 0;

            for (const member of team.members) {
                const accountId = member.accountId;
                const leave = leaveData.find((l) => l.accountId === accountId);
                const leaveDays = leave?.leaveDays || 0;

                if (leaveDays === -1) {
                    engineerDetails.push({ accountId, name: member.name, capacity: 0, excluded: true, leaveDays: -1 });
                    excludedList.push({ name: member.name });
                    continue;
                }

                activeEngineers++;
                const adjustment = capacityAdjustments.find((adj: any) => adj.accountId === accountId);
                const capacityPercent = adjustment?.capacity || 100;
                const availableDays = workingDays - leaveDays;
                const effectiveDays = (availableDays * capacityPercent) / 100;
                totalManDays += effectiveDays;

                engineerDetails.push({ accountId, name: member.name, capacity: capacityPercent, reason: adjustment?.reason, leaveDays });
                if (leaveDays > 0) leavesList.push({ name: member.name, leaveDays });
            }

            const effectiveEngineers = workingDays > 0 ? totalManDays / workingDays : 0;
            const pointsPerManDay = 1.8;
            const forecastedPoints = Math.floor(totalManDays * pointsPerManDay);

            const formattedHolidays = sprintHolidays
                .filter(h => !isWeekend(h.holiday_date))
                .map(h => ({ date: h.holiday_date, name: h.holiday_name }));

            return {
                sprintId,
                sprintName,
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                capacity: {
                    totalEngineers: activeEngineers,
                    effectiveEngineers: Math.round(effectiveEngineers * 10) / 10,
                    totalManDays: Math.round(totalManDays * 10) / 10,
                    forecastedPoints,
                },
                engineers: engineerDetails,
                holidays: formattedHolidays.length > 0 ? formattedHolidays : undefined,
                leaves: leavesList.length > 0 ? leavesList : undefined,
                excludedMembers: excludedList.length > 0 ? excludedList : undefined,
            };
        });

        return NextResponse.json({
            success: true,
            data: {
                boardId,
                teamName: team.name,
                sprints: forecasts,
                engineers: team.members.map((m) => ({
                    accountId: m.accountId,
                    name: m.name,
                })),
            },
        });
    } catch (error) {
        console.error('Error generating forecast:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to generate forecast' },
            { status: 500 }
        );
    }
}
