import { NextResponse } from 'next/server';
import { prisma, isDatabaseAvailable } from '@/lib/db';

// GET /api/settings/data-sources — list all data sources
export async function GET() {
    try {
        if (!isDatabaseAvailable() || !prisma) {
            return NextResponse.json(
                { success: false, error: 'Database not configured' },
                { status: 503 }
            );
        }

        const dataSources = await prisma.dataSource.findMany({
            include: { team: { select: { id: true, name: true } } },
            orderBy: { name: 'asc' },
        });

        return NextResponse.json({ success: true, data: dataSources });
    } catch (error) {
        console.error('Error fetching data sources:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Failed to fetch data sources' },
            { status: 500 }
        );
    }
}

// POST /api/settings/data-sources — create a new data source
export async function POST(request: Request) {
    try {
        if (!isDatabaseAvailable() || !prisma) {
            return NextResponse.json(
                { success: false, error: 'Database not configured' },
                { status: 503 }
            );
        }

        const body = await request.json();
        const { name, boardId, jqlQuery, isActive, fetchWorklogs, teamId } = body;

        if (!name || boardId === undefined || !teamId) {
            return NextResponse.json(
                { success: false, error: 'name, boardId, and teamId are required' },
                { status: 400 }
            );
        }

        const dataSource = await prisma.dataSource.create({
            data: {
                name,
                boardId: parseInt(boardId),
                jqlQuery: jqlQuery || null,
                isActive: isActive ?? true,
                fetchWorklogs: fetchWorklogs ?? true,
                teamId,
            },
            include: { team: { select: { id: true, name: true } } },
        });

        return NextResponse.json({ success: true, data: dataSource });
    } catch (error) {
        console.error('Error creating data source:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Failed to create data source' },
            { status: 500 }
        );
    }
}

// PUT /api/settings/data-sources — update a data source
export async function PUT(request: Request) {
    try {
        if (!isDatabaseAvailable() || !prisma) {
            return NextResponse.json(
                { success: false, error: 'Database not configured' },
                { status: 503 }
            );
        }

        const body = await request.json();
        const { id, name, boardId, jqlQuery, isActive, fetchWorklogs, teamId } = body;

        if (!id) {
            return NextResponse.json(
                { success: false, error: 'id is required' },
                { status: 400 }
            );
        }

        const dataSource = await prisma.dataSource.update({
            where: { id },
            data: {
                ...(name !== undefined && { name }),
                ...(boardId !== undefined && { boardId: parseInt(boardId) }),
                ...(jqlQuery !== undefined && { jqlQuery: jqlQuery || null }),
                ...(isActive !== undefined && { isActive }),
                ...(fetchWorklogs !== undefined && { fetchWorklogs }),
                ...(teamId !== undefined && { teamId }),
            },
            include: { team: { select: { id: true, name: true } } },
        });

        return NextResponse.json({ success: true, data: dataSource });
    } catch (error) {
        console.error('Error updating data source:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Failed to update data source' },
            { status: 500 }
        );
    }
}

// DELETE /api/settings/data-sources — delete a data source
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

        await prisma.dataSource.delete({ where: { id } });

        return NextResponse.json({ success: true, message: 'Data source deleted' });
    } catch (error) {
        console.error('Error deleting data source:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Failed to delete data source' },
            { status: 500 }
        );
    }
}
