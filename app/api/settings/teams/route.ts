import { NextResponse } from 'next/server';
import { prisma, isDatabaseAvailable } from '@/lib/db';

// GET /api/settings/teams — list all teams with members
export async function GET() {
    try {
        if (!isDatabaseAvailable() || !prisma) {
            return NextResponse.json(
                { success: false, error: 'Database not configured' },
                { status: 503 }
            );
        }

        const teams = await prisma.team.findMany({
            include: { members: { orderBy: { name: 'asc' } } },
            orderBy: { name: 'asc' },
        });

        return NextResponse.json({ success: true, data: teams });
    } catch (error) {
        console.error('Error fetching teams:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Failed to fetch teams' },
            { status: 500 }
        );
    }
}

// POST /api/settings/teams — create a new team
export async function POST(request: Request) {
    try {
        if (!isDatabaseAvailable() || !prisma) {
            return NextResponse.json(
                { success: false, error: 'Database not configured' },
                { status: 503 }
            );
        }

        const { name, boardId } = await request.json();

        if (!name || boardId === undefined) {
            return NextResponse.json(
                { success: false, error: 'name and boardId are required' },
                { status: 400 }
            );
        }

        const team = await prisma.team.create({
            data: { name, boardId: parseInt(boardId) },
        });

        return NextResponse.json({ success: true, data: team });
    } catch (error) {
        console.error('Error creating team:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Failed to create team' },
            { status: 500 }
        );
    }
}

// PUT /api/settings/teams — update a team
export async function PUT(request: Request) {
    try {
        if (!isDatabaseAvailable() || !prisma) {
            return NextResponse.json(
                { success: false, error: 'Database not configured' },
                { status: 503 }
            );
        }

        const { id, name, boardId, reportEmailGroup, isSchedulingEnabled } = await request.json();

        if (!id) {
            return NextResponse.json(
                { success: false, error: 'id is required' },
                { status: 400 }
            );
        }

        const team = await prisma.team.update({
            where: { id },
            data: {
                ...(name !== undefined && { name }),
                ...(boardId !== undefined && { boardId: parseInt(boardId) }),
                ...(reportEmailGroup !== undefined && { reportEmailGroup }),
                ...(isSchedulingEnabled !== undefined && { isSchedulingEnabled }),
            },
        });

        return NextResponse.json({ success: true, data: team });
    } catch (error) {
        console.error('Error updating team:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Failed to update team' },
            { status: 500 }
        );
    }
}

// DELETE /api/settings/teams — delete a team (cascades to members)
export async function DELETE(request: Request) {
    try {
        if (!isDatabaseAvailable() || !prisma) {
            return NextResponse.json(
                { success: false, error: 'Database not configured' },
                { status: 503 }
            );
        }

        const { id } = await request.json();

        if (!id) {
            return NextResponse.json(
                { success: false, error: 'id is required' },
                { status: 400 }
            );
        }

        await prisma.team.delete({ where: { id } });

        return NextResponse.json({ success: true, message: 'Team deleted' });
    } catch (error) {
        console.error('Error deleting team:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Failed to delete team' },
            { status: 500 }
        );
    }
}
