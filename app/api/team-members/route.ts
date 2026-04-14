import { NextResponse } from 'next/server';
import { teamRoster, TeamMember } from '@/lib/team-roster';
import { prisma, isDatabaseAvailable } from '@/lib/db';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const boardIdParam = searchParams.get('boardId');
        const searchQuery = searchParams.get('search')?.toLowerCase() || '';

        // Collect all members from all teams
        const allMembers: Array<TeamMember & { teamId: string; teamName: string; boardId: number }> = [];

        // Try DB first (consistent with utilization calculator)
        let usedDb = false;
        if (isDatabaseAvailable() && prisma) {
            try {
                const whereClause = boardIdParam
                    ? { boardId: parseInt(boardIdParam) }
                    : {};
                const dbTeams = await prisma.team.findMany({
                    where: whereClause,
                    include: { members: { orderBy: { name: 'asc' } } },
                    orderBy: { name: 'asc' },
                });
                if (dbTeams.length > 0) {
                    usedDb = true;
                    for (const team of dbTeams) {
                        for (const member of team.members) {
                            allMembers.push({
                                accountId: member.accountId,
                                name: member.name,
                                email: member.email,
                                role: member.role as 'qa' | 'engineer',
                                title: member.title,
                                teamId: team.id,
                                teamName: team.name,
                                boardId: team.boardId,
                            });
                        }
                    }
                }
            } catch (error) {
                console.warn('Failed to fetch team members from DB, falling back to JSON:', error);
            }
        }

        // Fallback to static JSON if DB had no results
        if (!usedDb) {
            for (const [teamId, teamConfig] of Object.entries(teamRoster.teams)) {
                // Filter by board if specified
                if (boardIdParam && teamConfig.boardId !== parseInt(boardIdParam)) {
                    continue;
                }

                for (const member of teamConfig.members) {
                    allMembers.push({
                        ...member,
                        teamId,
                        teamName: teamConfig.name,
                        boardId: teamConfig.boardId,
                    });
                }
            }
        }

        // Apply search filter
        const filteredMembers = searchQuery
            ? allMembers.filter(member => {
                const matchesSearch =
                    member.name.toLowerCase().includes(searchQuery) ||
                    member.email.toLowerCase().includes(searchQuery) ||
                    member.role.toLowerCase().includes(searchQuery);
                return matchesSearch;
            })
            : allMembers;

        // Group by team for easier frontend rendering
        const groupedByTeam = filteredMembers.reduce((acc, member) => {
            if (!acc[member.teamId]) {
                acc[member.teamId] = {
                    teamId: member.teamId,
                    teamName: member.teamName,
                    boardId: member.boardId,
                    members: [],
                };
            }
            acc[member.teamId].members.push(member);
            return acc;
        }, {} as Record<string, { teamId: string; teamName: string; boardId: number; members: typeof filteredMembers }>);

        // Calculate summary statistics
        const totalMembers = filteredMembers.length;
        const engineerCount = filteredMembers.filter(m => m.role === 'engineer').length;
        const qaCount = filteredMembers.filter(m => m.role === 'qa').length;

        return NextResponse.json({
            success: true,
            data: {
                teams: Object.values(groupedByTeam),
                summary: {
                    totalMembers,
                    engineerCount,
                    qaCount,
                },
            },
        }, {
            headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
        });
    } catch (error) {
        console.error('Error fetching team members:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to fetch team members',
            },
            { status: 500 }
        );
    }
}
