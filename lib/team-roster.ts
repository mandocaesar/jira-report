import teamRosterData from '@/config/team-roster.json';

export interface TeamMember {
    accountId: string;
    name: string;
    email: string;
    role: 'qa' | 'engineer';
    title: string;
}

export interface TeamConfig {
    name: string;
    boardId: number;
    members: TeamMember[];
}

export interface TeamRosterConfig {
    teams: Record<string, TeamConfig>;
    sprintLeave: Record<string, Record<string, number>>;
}

const teamRoster = teamRosterData as TeamRosterConfig;

/**
 * Get team configuration by team ID
 */
export function getTeamByTeamId(teamId: string): TeamConfig | null {
    return teamRoster.teams[teamId] || null;
}

/**
 * Get team configuration by board ID
 */
export function getTeamByBoardId(boardId: number): { teamId: string; config: TeamConfig } | null {
    for (const [teamId, config] of Object.entries(teamRoster.teams)) {
        if (config.boardId === boardId) {
            return { teamId, config };
        }
    }
    return null;
}

/**
 * Get member info by account ID
 */
export function getMemberByAccountId(accountId: string): { teamId: string; member: TeamMember } | null {
    for (const [teamId, config] of Object.entries(teamRoster.teams)) {
        const member = config.members.find(m => m.accountId === accountId);
        if (member) {
            return { teamId, member };
        }
    }
    return null;
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
