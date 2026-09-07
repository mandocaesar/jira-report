import { NextRequest } from 'next/server';
import { prisma, isDatabaseAvailable } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api-helpers';
import { createJiraClient } from '@/lib/jira-client';
import { computeHealth } from '@/lib/context-health';

export const dynamic = 'force-dynamic';

// GET /api/context/health?boardId=X&sprintId=Y — data-health chip for the context bar
export async function GET(request: NextRequest) {
    try {
        const url = new URL(request.url);
        const boardId = parseInt(url.searchParams.get('boardId') || '');
        const sprintId = parseInt(url.searchParams.get('sprintId') || '');
        if (isNaN(boardId)) return apiError('boardId is required', 400);

        // Sprint years: from the sprint when given, else current year
        let sprintYears = [new Date().getFullYear()];
        if (!isNaN(sprintId)) {
            const sprint = await createJiraClient().getSprint(sprintId);
            if (sprint.startDate && sprint.endDate) {
                const y1 = new Date(sprint.startDate).getFullYear();
                const y2 = new Date(sprint.endDate).getFullYear();
                sprintYears = y1 === y2 ? [y1] : [y1, y2];
            }
        }

        let teamInDb = false;
        let engineerCount = 0;
        let qaCount = 0;
        let lastSyncedAt: Date | null = null;
        let seededYears: number[] = [];

        if (isDatabaseAvailable() && prisma) {
            const team = await prisma.team.findUnique({
                where: { boardId },
                include: { members: { select: { role: true, excludeFromUtilization: true } } },
            });
            if (team) {
                teamInDb = true;
                lastSyncedAt = team.lastSyncedAt;
                const active = team.members.filter(m => !m.excludeFromUtilization);
                engineerCount = active.filter(m => m.role !== 'qa').length;
                qaCount = active.filter(m => m.role === 'qa').length;
            }
            const years = await prisma.holiday.findMany({
                where: { isActive: true, year: { in: sprintYears } },
                select: { year: true },
                distinct: ['year'],
            });
            seededYears = years.map(y => y.year);
        }

        return apiSuccess(computeHealth({
            teamInDb,
            engineerCount,
            qaCount,
            sprintYears,
            seededYears,
            lastSyncedAt,
            now: new Date(),
        }));
    } catch (error) {
        console.error('Error in context health:', error);
        return apiError(error instanceof Error ? error.message : 'Health check failed', 500);
    }
}
