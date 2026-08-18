import teamRosterData from '@/config/team-roster.json';

export interface TeamMember {
    accountId: string;
    name: string;
    email: string;
    role: 'qa' | 'engineer';
    title: string;
    workingHoursPerDay?: number; // Override team default; null/undefined = inherit
    excludeFromUtilization?: boolean; // Auto-exclude from utilization (e.g. EMs)
}

export interface TeamConfig {
    name: string;
    boardId: number;
    members: TeamMember[];
    workingHoursPerDay?: number; // Team standard hours/day (default 8 if not set)
}

export interface TeamRosterConfig {
    teams: Record<string, TeamConfig>;
    sprintLeave: Record<string, Record<string, number>>;
    titleAvailableDays: Record<string, number>;
}

const teamRoster = teamRosterData as TeamRosterConfig;

// ─── Reverse Index Maps (O(1) lookups) ─────────────────────────────────────────

const boardIdToTeam = new Map<number, { teamId: string; config: TeamConfig }>();
const accountIdToMember = new Map<string, { teamId: string; member: TeamMember }>();

for (const [teamId, config] of Object.entries(teamRoster.teams)) {
    boardIdToTeam.set(config.boardId, {
        teamId,
        config: { ...config, workingHoursPerDay: config.workingHoursPerDay ?? 8 },
    });
    for (const member of config.members) {
        accountIdToMember.set(member.accountId, { teamId, member });
    }
}

/**
 * Get team configuration by team ID
 */
export function getTeamByTeamId(teamId: string): TeamConfig | null {
    return teamRoster.teams[teamId] || null;
}

/**
 * Get team configuration by board ID — O(1) via reverse index
 */
export function getTeamByBoardId(boardId: number): { teamId: string; config: TeamConfig } | null {
    return boardIdToTeam.get(boardId) || null;
}

/**
 * Get member info by account ID — O(1) via reverse index
 */
export function getMemberByAccountId(accountId: string): { teamId: string; member: TeamMember } | null {
    return accountIdToMember.get(accountId) || null;
}

/**
 * Get all QA members for a team
 */
export function getQAMembers(teamId: string): TeamMember[] {
    const team = teamRoster.teams[teamId];
    if (!team) return [];
    return team.members.filter(m => m.role === 'qa');
}

/**
 * Get all Engineer members for a team
 */
export function getEngineerMembers(teamId: string): TeamMember[] {
    const team = teamRoster.teams[teamId];
    if (!team) return [];
    return team.members.filter(m => m.role === 'engineer');
}

export { teamRoster };

import { prisma, isDatabaseAvailable } from './db';

/**
 * Get team by board ID from the database, falling back to static JSON
 */
export async function getTeamByBoardIdFromDb(
    boardId: number
): Promise<{ teamId: string; config: TeamConfig } | null> {
    if (isDatabaseAvailable() && prisma) {
        try {
            const team = await prisma.team.findUnique({
                where: { boardId },
                include: { members: true },
            });
            if (team) {
                return {
                    teamId: team.id,
                    config: {
                        name: team.name,
                        boardId: team.boardId,
                        workingHoursPerDay: team.workingHoursPerDay,
                        members: team.members.map((m) => ({
                            accountId: m.accountId,
                            name: m.name,
                            email: m.email,
                            role: m.role as 'qa' | 'engineer',
                            title: m.title,
                            workingHoursPerDay: m.workingHoursPerDay ?? undefined,
                            excludeFromUtilization: m.excludeFromUtilization,
                        })),
                    },
                };
            }
        } catch (error) {
            console.warn('Failed to fetch team from DB, falling back to JSON:', error);
        }
    }
    return getTeamByBoardId(boardId);
}

