import { NextResponse } from 'next/server';
import { teamRoster, TeamMember } from '@/lib/team-roster';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const boardIdParam = searchParams.get('boardId');
        const searchQuery = searchParams.get('search')?.toLowerCase() || '';

        // Collect all members from all teams
        const allMembers: Array<TeamMember & { teamId: string; teamName: string; boardId: number }> = [];

        for (const [teamId, teamConfig] of Object.entries(teamRoster.teams)) {
            // Filter by board if specified
            if (boardIdParam && teamConfig.boardId !== parseInt(boardIdParam)) {
                continue;
            }

            for (const member of teamConfig.members) {
                // Apply search filter
                if (searchQuery) {
                    const matchesSearch =
                        member.name.toLowerCase().includes(searchQuery) ||
                        member.email.toLowerCase().includes(searchQuery) ||
                        member.role.toLowerCase().includes(searchQuery);

                    if (!matchesSearch) continue;
                }

                allMembers.push({
                    ...member,
                    teamId,
                    teamName: teamConfig.name,
                    boardId: teamConfig.boardId,
                });
            }
        }

        // Group by team for easier frontend rendering
        const groupedByTeam = allMembers.reduce((acc, member) => {
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
        }, {} as Record<string, { teamId: string; teamName: string; boardId: number; members: typeof allMembers }>);

        // Calculate summary statistics
        const totalMembers = allMembers.length;
        const engineerCount = allMembers.filter(m => m.role === 'engineer').length;
        const qaCount = allMembers.filter(m => m.role === 'qa').length;

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
