import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api-helpers';
import { createJiraClient } from '@/lib/jira-client';
import { getTeamByBoardId } from '@/lib/team-roster';
import { apiCache } from '@/lib/cache';
import {
    computeEmReport,
    computeCarryOverByRole,
    EmReportRole,
} from '@/lib/em-report';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_YTD_SPRINTS = 12;

async function getRoleData(boardId: number): Promise<{
    roleMap: Map<string, EmReportRole>;
    memberCounts: Record<EmReportRole, number>;
}> {
    const roleMap = new Map<string, EmReportRole>();
    const memberCounts: Record<EmReportRole, number> = { engineer: 0, qa: 0 };

    let members: Array<{ accountId: string; role: string }> = [];
    if (prisma) {
        const team = await prisma.team.findUnique({
            where: { boardId },
            include: { members: { select: { accountId: true, role: true } } },
        });
        if (team) members = team.members;
    }
    if (members.length === 0) {
        members = getTeamByBoardId(boardId)?.config.members ?? [];
    }

    for (const m of members) {
        const role: EmReportRole = m.role === 'qa' ? 'qa' : 'engineer';
        roleMap.set(m.accountId, role);
        memberCounts[role]++;
    }
    return { roleMap, memberCounts };
}

/** Average carry-over points per role across this year's closed sprints (up to the selected one). */
async function getYtdCarryOver(
    boardId: number,
    selectedSprint: { id: number; startDate: string },
    roleMap: Map<string, EmReportRole>,
): Promise<Record<EmReportRole, { avgCarryOver: number; sprintCount: number }>> {
    const year = new Date(selectedSprint.startDate).getFullYear();
    const cacheKey = `emReport:ytd:${boardId}:${year}:${selectedSprint.id}`;

    return apiCache.getOrFetch(cacheKey, async () => {
        const jiraClient = createJiraClient();
        const sprints = await jiraClient.getSprints(boardId);
        const ytdSprints = sprints
            .filter(s =>
                s.state === 'closed' &&
                s.startDate &&
                new Date(s.startDate).getFullYear() === year &&
                Date.parse(s.startDate) <= Date.parse(selectedSprint.startDate)
            )
            .sort((a, b) => Date.parse(b.startDate) - Date.parse(a.startDate))
            .slice(0, MAX_YTD_SPRINTS);

        const totals: Record<EmReportRole, number> = { engineer: 0, qa: 0 };
        let counted = 0;
        for (const s of ytdSprints) {
            try {
                const issues = await jiraClient.getSprintIssues(s.id, boardId);
                const carry = computeCarryOverByRole(issues, roleMap);
                totals.engineer += carry.engineer;
                totals.qa += carry.qa;
                counted++;
            } catch {
                // Skip sprints that fail to load; YTD stays a best-effort average
            }
        }

        const avg = (v: number) => counted > 0 ? Math.round((v / counted) * 100) / 100 : 0;
        return {
            engineer: { avgCarryOver: avg(totals.engineer), sprintCount: counted },
            qa: { avgCarryOver: avg(totals.qa), sprintCount: counted },
        };
    });
}

export async function GET(request: NextRequest) {
    try {
        const url = new URL(request.url);
        const sprintId = parseInt(url.searchParams.get('sprintId') || '');
        const boardId = parseInt(url.searchParams.get('boardId') || '');
        if (isNaN(sprintId) || isNaN(boardId)) {
            return apiError('sprintId and boardId are required', 400);
        }

        const jiraClient = createJiraClient();
        const [{ roleMap, memberCounts }, sprint] = await Promise.all([
            getRoleData(boardId),
            jiraClient.getSprint(sprintId),
        ]);

        // Changelog needed for committed-at-start / added-mid-sprint detection
        const issues = await jiraClient.getSprintIssuesWithChangelog(sprintId, boardId);
        const report = computeEmReport(sprint, issues, roleMap, memberCounts);

        const [ytd, notes] = await Promise.all([
            getYtdCarryOver(boardId, sprint, roleMap),
            prisma
                ? prisma.sprintEmNote.findMany({ where: { boardId, sprintId } })
                : Promise.resolve([]),
        ]);

        const noteMap = Object.fromEntries(notes.map(n => [n.role, {
            pic: n.pic,
            highlights: n.highlights,
            carryOverReason: n.carryOverReason,
        }]));

        return apiSuccess({
            sprint: { id: sprint.id, name: sprint.name, state: sprint.state, startDate: sprint.startDate, endDate: sprint.endDate },
            rows: report.rows.map(row => ({
                ...row,
                ytdAvgCarryOver: ytd[row.role].avgCarryOver,
                ytdSprintCount: ytd[row.role].sprintCount,
                note: noteMap[row.role] ?? null,
            })),
            notesEditable: Boolean(prisma),
            jiraDomain: process.env.JIRA_DOMAIN || '',
        });
    } catch (error) {
        console.error('Error in EM report API:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to build EM report', 500);
    }
}

export async function POST(request: NextRequest) {
    try {
        if (!prisma) return apiError('Database not available', 503);

        const body = await request.json();
        const { boardId, sprintId, role, pic, highlights, carryOverReason } = body;
        if (!boardId || !sprintId || !['engineer', 'qa'].includes(role)) {
            return apiError('boardId, sprintId and role (engineer|qa) are required', 400);
        }

        const note = await prisma.sprintEmNote.upsert({
            where: { boardId_sprintId_role: { boardId, sprintId, role } },
            update: { pic: pic ?? null, highlights: highlights ?? null, carryOverReason: carryOverReason ?? null },
            create: {
                boardId,
                sprintId,
                role,
                pic: pic ?? null,
                highlights: highlights ?? null,
                carryOverReason: carryOverReason ?? null,
            },
        });
        return apiSuccess({ note });
    } catch (error) {
        console.error('Error saving EM report note:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to save note', 500);
    }
}
