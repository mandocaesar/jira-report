import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { apiSuccess, apiError, requireDatabase } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

// POST /api/organisation/squads/sync — create or update squad from discovery
export async function POST(request: NextRequest) {
    try {
        const dbErr = requireDatabase(); if (dbErr) return dbErr;

        const body = await request.json();
        const { boardId, teamName, members } = body as {
            boardId: number;
            teamName: string;
            members: Array<{
                accountId: string;
                displayName: string;
                emailAddress: string;
                role: 'engineer' | 'qa';
                title: string;
            }>;
        };

        if (!boardId || !teamName || !members?.length) {
            return apiError('boardId, teamName, and members are required', 400);
        }

        // Check if team already exists for this board
        const existingTeam = await prisma!.team.findUnique({
            where: { boardId },
            include: { members: true },
        });

        let team;

        if (existingTeam) {
            // Update existing team
            // Remove members not in the new list
            const newAccountIds = new Set(members.map(m => m.accountId));
            const toRemove = existingTeam.members.filter(m => !newAccountIds.has(m.accountId));

            if (toRemove.length > 0) {
                await prisma!.teamMember.deleteMany({
                    where: { id: { in: toRemove.map(m => m.id) } },
                });
            }

            // Upsert each member
            for (const member of members) {
                await prisma!.teamMember.upsert({
                    where: {
                        teamId_accountId: {
                            teamId: existingTeam.id,
                            accountId: member.accountId,
                        },
                    },
                    update: {
                        name: member.displayName,
                        email: member.emailAddress,
                        role: member.role,
                        title: member.title,
                    },
                    create: {
                        accountId: member.accountId,
                        name: member.displayName,
                        email: member.emailAddress,
                        role: member.role,
                        title: member.title,
                        teamId: existingTeam.id,
                    },
                });
            }

            team = await prisma!.team.update({
                where: { id: existingTeam.id },
                data: {
                    name: teamName,
                    status: 'active',
                    lastSyncedAt: new Date(),
                },
                include: { members: true },
            });
        } else {
            // Create new team
            team = await prisma!.team.create({
                data: {
                    name: teamName,
                    boardId,
                    status: 'active',
                    lastSyncedAt: new Date(),
                    members: {
                        create: members.map(m => ({
                            accountId: m.accountId,
                            name: m.displayName,
                            email: m.emailAddress,
                            role: m.role,
                            title: m.title,
                        })),
                    },
                },
                include: { members: true },
            });
        }

        return apiSuccess({
                id: team.id,
                name: team.name,
                boardId: team.boardId,
                status: team.status,
                lastSyncedAt: team.lastSyncedAt,
                memberCount: team.members.length,
                engineerCount: team.members.filter(m => m.role === 'engineer').length,
                qaCount: team.members.filter(m => m.role === 'qa').length,
            });
    } catch (error) {
        console.error('Error syncing squad:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to sync squad', 500);
    }
}
