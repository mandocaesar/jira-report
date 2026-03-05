import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getTeamByBoardIdFromDb } from '@/lib/team-roster';
import { calculateWorkingDays, getHolidaysInRange, isWeekend } from '@/lib/holiday-service';

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

        // Calculate forecast for each sprint
        const forecasts: SprintForecast[] = [];

        for (const sprint of relevantSprints) {
            const sprintId = sprint.id;
            const sprintName = sprint.name;
            const startDate = new Date(sprint.startDate);
            const endDate = new Date(sprint.endDate);

            // Get capacity adjustments for this sprint period
            let capacityAdjustments: any[] = [];
            if (prisma) {
                try {
                    capacityAdjustments = await prisma.engineerCapacity.findMany({
                        where: {
                            OR: [
                                {
                                    startDate: {
                                        lte: endDate,
                                    },
                                    endDate: {
                                        gte: startDate,
                                    },
                                },
                            ],
                        },
                    });
                } catch (dbError) {
                    console.warn('Database unavailable for capacity adjustments, using defaults');
                }
            }

            // Get leave data for this sprint
            let leaveData: any[] = [];
            if (prisma) {
                try {
                    leaveData = await prisma.sprintLeave.findMany({
                        where: { sprintId },
                    });
                } catch (dbError) {
                    console.warn('Database unavailable for leave data, using defaults');
                }
            }

            const workingDays = await calculateWorkingDays(startDate, endDate);
            let totalManDays = 0;
            const engineerDetails: any[] = [];
            const leavesList: Array<{ name: string; leaveDays: number }> = [];
            const excludedList: Array<{ name: string }> = [];
            let activeEngineers = 0;

            // Calculate capacity for each engineer
            for (const member of team.members) {
                const accountId = member.accountId;

                // Get leave days
                const leave = leaveData.find((l) => l.accountId === accountId);
                const leaveDays = leave?.leaveDays || 0;

                // Check if member is excluded (leaveDays = -1)
                if (leaveDays === -1) {
                    engineerDetails.push({
                        accountId,
                        name: member.name,
                        capacity: 0,
                        excluded: true,
                        leaveDays: -1,
                    });
                    excludedList.push({ name: member.name });
                    continue;
                }

                activeEngineers++;

                // Find capacity adjustment for this engineer
                const adjustment = capacityAdjustments.find(
                    (adj) => adj.accountId === accountId
                );
                const capacityPercent = adjustment?.capacity || 100;

                // Calculate effective days
                const availableDays = workingDays - leaveDays;
                const effectiveDays = (availableDays * capacityPercent) / 100;

                totalManDays += effectiveDays;

                engineerDetails.push({
                    accountId,
                    name: member.name,
                    capacity: capacityPercent,
                    reason: adjustment?.reason,
                    leaveDays,
                });

                if (leaveDays > 0) {
                    leavesList.push({ name: member.name, leaveDays });
                }
            }

            const effectiveEngineers = workingDays > 0 ? totalManDays / workingDays : 0;

            // Estimate story points (assuming 1.8 points per man-day, adjustable)
            const pointsPerManDay = 1.8;
            const forecastedPoints = Math.floor(totalManDays * pointsPerManDay);

            // Fetch specific holidays for this sprint (excluding weekends)
            const rawHolidays = await getHolidaysInRange(startDate, endDate);
            const formattedHolidays = rawHolidays
                .filter(h => !isWeekend(h.holiday_date))
                .map(h => ({
                    date: h.holiday_date,
                    name: h.holiday_name
                }));

            forecasts.push({
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
            });
        }

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
