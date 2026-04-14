import teamRosterData from '@/config/team-roster.json';

export interface TeamMember {
    accountId: string;
    name: string;
    email: string;
    role: 'qa' | 'engineer';
    title: string;
    workingHoursPerDay?: number; // Override team default; null/undefined = inherit
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
 * Get leave days for a member in a specific sprint
 */
export function getSprintLeave(sprintId: number, accountId: string): number {
    const sprintLeave = teamRoster.sprintLeave[sprintId.toString()];
    if (!sprintLeave) return 0;
    return sprintLeave[accountId] || 0;
}

/**
 * Get available days per sprint for a given title level
 * Tech Lead = 5, EM = 0, Sec Head/Associate/QA = 10
 */
export function getAvailableDaysByTitle(title: string): number {
    const config = teamRoster.titleAvailableDays;
    if (config && title in config) {
        return config[title];
    }
    return config?._default ?? 10;
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

/**
 * Calculate team capacity breakdown (QA vs Engineers)
 */
export function calculateTeamCapacity(
    teamId: string,
    sprintId: number,
    workingDays: number
): {
    qaCount: number;
    engineerCount: number;
    qaMandays: number;
    engineerMandays: number;
    totalMandays: number;
    qaLeave: number;
    engineerLeave: number;
} {
    const team = teamRoster.teams[teamId];
    if (!team) {
        return {
            qaCount: 0,
            engineerCount: 0,
            qaMandays: 0,
            engineerMandays: 0,
            totalMandays: 0,
            qaLeave: 0,
            engineerLeave: 0,
        };
    }

    let qaCount = 0;
    let engineerCount = 0;
    let qaLeave = 0;
    let engineerLeave = 0;

    for (const member of team.members) {
        const leave = getSprintLeave(sprintId, member.accountId);
        if (member.role === 'qa') {
            qaCount++;
            qaLeave += leave;
        } else {
            engineerCount++;
            engineerLeave += leave;
        }
    }

    const qaMandays = qaCount * workingDays - qaLeave;
    const engineerMandays = engineerCount * workingDays - engineerLeave;

    return {
        qaCount,
        engineerCount,
        qaMandays,
        engineerMandays,
        totalMandays: qaMandays + engineerMandays,
        qaLeave,
        engineerLeave,
    };
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

/**
 * Get title available days map from the database, falling back to static JSON
 */
export async function getTitleDaysMapFromDb(): Promise<Record<string, number>> {
    if (isDatabaseAvailable() && prisma) {
        try {
            const entries = await prisma.titleAvailableDays.findMany();
            if (entries.length > 0) {
                const map: Record<string, number> = {};
                for (const entry of entries) {
                    map[entry.title] = entry.availableDays;
                }
                return map;
            }
        } catch (error) {
            console.warn('Failed to fetch title days from DB, falling back to JSON:', error);
        }
    }
    // Fallback to static JSON config
    const config = teamRoster.titleAvailableDays;
    const map: Record<string, number> = {};
    for (const [title, days] of Object.entries(config)) {
        if (title !== '_default') {
            map[title] = days;
        }
    }
    return map;
}

/**
 * Get available days for a title from a preloaded map, with fallback
 */
export function getAvailableDaysFromMap(
    title: string,
    titleDaysMap: Record<string, number>
): number {
    if (title in titleDaysMap) {
        return titleDaysMap[title];
    }
    // Fallback to static JSON config
    return getAvailableDaysByTitle(title);
}
