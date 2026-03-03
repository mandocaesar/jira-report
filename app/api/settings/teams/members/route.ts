import { NextResponse } from 'next/server';
import { prisma, isDatabaseAvailable } from '@/lib/db';

// POST /api/settings/teams/members — add a member to a team
export async function POST(request: Request) {
    try {
        if (!isDatabaseAvailable() || !prisma) {
            return NextResponse.json(
                { success: false, error: 'Database not configured' },
                { status: 503 }
            );
        }

        const { teamId, accountId, name, email, role, title } = await request.json();

        if (!teamId || !accountId || !name || !email) {
            return NextResponse.json(
                { success: false, error: 'teamId, accountId, name, and email are required' },
                { status: 400 }
            );
        }

        const member = await prisma.teamMember.create({
            data: {
                teamId,
                accountId,
                name,
                email,
                role: role || 'engineer',
                title: title || 'Associate',
            },
        });

        return NextResponse.json({ success: true, data: member });
    } catch (error) {
        console.error('Error adding member:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Failed to add member' },
            { status: 500 }
        );
    }
}

// PUT /api/settings/teams/members — update a member
export async function PUT(request: Request) {
    try {
        if (!isDatabaseAvailable() || !prisma) {
            return NextResponse.json(
                { success: false, error: 'Database not configured' },
                { status: 503 }
            );
        }

        const { id, name, email, role, title } = await request.json();

        if (!id) {
            return NextResponse.json(
                { success: false, error: 'id is required' },
                { status: 400 }
            );
        }

        const member = await prisma.teamMember.update({
            where: { id },
            data: {
                ...(name !== undefined && { name }),
                ...(email !== undefined && { email }),
                ...(role !== undefined && { role }),
                ...(title !== undefined && { title }),
            },
        });

        return NextResponse.json({ success: true, data: member });
    } catch (error) {
        console.error('Error updating member:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Failed to update member' },
            { status: 500 }
        );
    }
}

// DELETE /api/settings/teams/members — remove a member
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

        await prisma.teamMember.delete({ where: { id } });

        return NextResponse.json({ success: true, message: 'Member removed' });
    } catch (error) {
        console.error('Error removing member:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Failed to remove member' },
            { status: 500 }
        );
    }
}
