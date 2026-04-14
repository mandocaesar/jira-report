import { prisma } from '@/lib/db';
import { apiSuccess, apiError, requireDatabase } from '@/lib/api-helpers';
import teamRosterData from '@/config/team-roster.json';

interface TeamRosterJson {
    teams: Record<string, {
        name: string;
        boardId: number;
        members: Array<{
            accountId: string;
            name: string;
            email: string;
            role: string;
            title: string;
        }>;
    }>;
    titleAvailableDays: Record<string, number>;
}

// POST /api/settings/seed — seed database from team-roster.json
export async function POST() {
    try {
        const dbErr = requireDatabase(); if (dbErr) return dbErr;

        const roster = teamRosterData as TeamRosterJson;
        const db = prisma!;

        let teamsCreated = 0;
        let membersCreated = 0;
        let titleDaysCreated = 0;

        // Seed teams and members
        for (const [, teamConfig] of Object.entries(roster.teams)) {
            const team = await db.team.upsert({
                where: { boardId: teamConfig.boardId },
                update: { name: teamConfig.name },
                create: {
                    name: teamConfig.name,
                    boardId: teamConfig.boardId,
                },
            });
            teamsCreated++;

            for (const member of teamConfig.members) {
                await db.teamMember.upsert({
                    where: {
                        teamId_accountId: {
                            teamId: team.id,
                            accountId: member.accountId,
                        },
                    },
                    update: {
                        name: member.name,
                        email: member.email,
                        role: member.role,
                        title: member.title,
                    },
                    create: {
                        teamId: team.id,
                        accountId: member.accountId,
                        name: member.name,
                        email: member.email,
                        role: member.role,
                        title: member.title,
                    },
                });
                membersCreated++;
            }
        }

        // Seed title available days
        if (roster.titleAvailableDays) {
            for (const [title, days] of Object.entries(roster.titleAvailableDays)) {
                if (title === '_default') continue;
                await db.titleAvailableDays.upsert({
                    where: { title },
                    update: { availableDays: days },
                    create: { title, availableDays: days },
                });
                titleDaysCreated++;
            }
        }

        return apiSuccess({ message: `Seeded ${teamsCreated} teams, ${membersCreated} members, ${titleDaysCreated} title day configs` });
    } catch (error) {
        console.error('Error seeding data:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to seed data', 500);
    }
}
