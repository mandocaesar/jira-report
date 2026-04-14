import { prisma } from '@/lib/db';
import { apiSuccess, apiError, requireDatabase } from '@/lib/api-helpers';

// GET /api/settings/data-sources — list all data sources
export async function GET() {
    try {
        const dbErr = requireDatabase(); if (dbErr) return dbErr;

        const dataSources = await prisma!.dataSource.findMany({
            include: { team: { select: { id: true, name: true } } },
            orderBy: { name: 'asc' },
        });

        return apiSuccess(dataSources);
    } catch (error) {
        console.error('Error fetching data sources:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to fetch data sources', 500);
    }
}

// POST /api/settings/data-sources — create a new data source
export async function POST(request: Request) {
    try {
        const dbErr = requireDatabase(); if (dbErr) return dbErr;

        const body = await request.json();
        const { name, boardId, jqlQuery, isActive, fetchWorklogs, teamId } = body;

        if (!name || boardId === undefined || !teamId) {
            return apiError('name, boardId, and teamId are required', 400);
        }

        const dataSource = await prisma!.dataSource.create({
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

        return apiSuccess(dataSource);
    } catch (error) {
        console.error('Error creating data source:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to create data source', 500);
    }
}

// PUT /api/settings/data-sources — update a data source
export async function PUT(request: Request) {
    try {
        const dbErr = requireDatabase(); if (dbErr) return dbErr;

        const body = await request.json();
        const { id, name, boardId, jqlQuery, isActive, fetchWorklogs, teamId } = body;

        if (!id) {
            return apiError('id is required', 400);
        }

        const dataSource = await prisma!.dataSource.update({
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

        return apiSuccess(dataSource);
    } catch (error) {
        console.error('Error updating data source:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to update data source', 500);
    }
}

// DELETE /api/settings/data-sources — delete a data source
export async function DELETE(request: Request) {
    try {
        const dbErr = requireDatabase(); if (dbErr) return dbErr;

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return apiError('id is required', 400);
        }

        await prisma!.dataSource.delete({ where: { id } });

        return apiSuccess({ message: 'Data source deleted' });
    } catch (error) {
        console.error('Error deleting data source:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to delete data source', 500);
    }
}
