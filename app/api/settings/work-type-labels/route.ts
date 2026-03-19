import { NextResponse } from 'next/server';
import { prisma, isDatabaseAvailable } from '@/lib/db';

// GET /api/settings/work-type-labels — list all work type labels
export async function GET() {
    try {
        if (!isDatabaseAvailable() || !prisma) {
            return NextResponse.json(
                { success: false, error: 'Database not configured' },
                { status: 503 }
            );
        }

        const labels = await prisma.workTypeLabel.findMany({
            orderBy: { labelName: 'asc' },
        });

        return NextResponse.json({ success: true, data: labels });
    } catch (error) {
        console.error('Error fetching work type labels:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Failed to fetch labels' },
            { status: 500 }
        );
    }
}

// POST /api/settings/work-type-labels — create a new label
export async function POST(request: Request) {
    try {
        if (!isDatabaseAvailable() || !prisma) {
            return NextResponse.json(
                { success: false, error: 'Database not configured' },
                { status: 503 }
            );
        }

        const body = await request.json();
        const { labelName, description, isActive } = body;

        if (!labelName) {
            return NextResponse.json(
                { success: false, error: 'labelName is required' },
                { status: 400 }
            );
        }

        const label = await prisma.workTypeLabel.create({
            data: {
                labelName,
                description: description || null,
                isActive: isActive ?? true,
            },
        });

        return NextResponse.json({ success: true, data: label });
    } catch (error) {
        console.error('Error creating work type label:', error);
        const msg = error instanceof Error ? error.message : 'Failed to create label';
        const status = msg.includes('Unique constraint') ? 409 : 500;
        return NextResponse.json({ success: false, error: msg }, { status });
    }
}

// PUT /api/settings/work-type-labels — update a label
export async function PUT(request: Request) {
    try {
        if (!isDatabaseAvailable() || !prisma) {
            return NextResponse.json(
                { success: false, error: 'Database not configured' },
                { status: 503 }
            );
        }

        const body = await request.json();
        const { id, labelName, description, isActive } = body;

        if (!id) {
            return NextResponse.json(
                { success: false, error: 'id is required' },
                { status: 400 }
            );
        }

        const label = await prisma.workTypeLabel.update({
            where: { id },
            data: {
                ...(labelName !== undefined && { labelName }),
                ...(description !== undefined && { description: description || null }),
                ...(isActive !== undefined && { isActive }),
            },
        });

        return NextResponse.json({ success: true, data: label });
    } catch (error) {
        console.error('Error updating work type label:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Failed to update label' },
            { status: 500 }
        );
    }
}

// DELETE /api/settings/work-type-labels — delete a label
export async function DELETE(request: Request) {
    try {
        if (!isDatabaseAvailable() || !prisma) {
            return NextResponse.json(
                { success: false, error: 'Database not configured' },
                { status: 503 }
            );
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { success: false, error: 'id is required' },
                { status: 400 }
            );
        }

        await prisma.workTypeLabel.delete({ where: { id } });

        return NextResponse.json({ success: true, message: 'Label deleted' });
    } catch (error) {
        console.error('Error deleting work type label:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Failed to delete label' },
            { status: 500 }
        );
    }
}
