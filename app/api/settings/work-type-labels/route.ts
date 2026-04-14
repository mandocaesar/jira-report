import { prisma } from '@/lib/db';
import { apiSuccess, apiError, requireDatabase } from '@/lib/api-helpers';

// GET /api/settings/work-type-labels — list all work type labels
export async function GET() {
    try {
        const dbErr = requireDatabase();
        if (dbErr) return dbErr;

        const labels = await prisma!.workTypeLabel.findMany({
            orderBy: { labelName: 'asc' },
        });

        return apiSuccess(labels);
    } catch (error) {
        console.error('Error fetching work type labels:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to fetch labels');
    }
}

// POST /api/settings/work-type-labels — create a new label
export async function POST(request: Request) {
    try {
        const dbErr = requireDatabase();
        if (dbErr) return dbErr;

        const body = await request.json();
        const { labelName, description, isActive } = body;

        if (!labelName) {
            return apiError('labelName is required', 400);
        }

        const label = await prisma!.workTypeLabel.create({
            data: {
                labelName,
                description: description || null,
                isActive: isActive ?? true,
            },
        });

        return apiSuccess(label);
    } catch (error) {
        console.error('Error creating work type label:', error);
        const msg = error instanceof Error ? error.message : 'Failed to create label';
        return apiError(msg, msg.includes('Unique constraint') ? 409 : 500);
    }
}

// PUT /api/settings/work-type-labels — update a label
export async function PUT(request: Request) {
    try {
        const dbErr = requireDatabase();
        if (dbErr) return dbErr;

        const body = await request.json();
        const { id, labelName, description, isActive } = body;

        if (!id) {
            return apiError('id is required', 400);
        }

        const label = await prisma!.workTypeLabel.update({
            where: { id },
            data: {
                ...(labelName !== undefined && { labelName }),
                ...(description !== undefined && { description: description || null }),
                ...(isActive !== undefined && { isActive }),
            },
        });

        return apiSuccess(label);
    } catch (error) {
        console.error('Error updating work type label:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to update label');
    }
}

// DELETE /api/settings/work-type-labels — delete a label
export async function DELETE(request: Request) {
    try {
        const dbErr = requireDatabase();
        if (dbErr) return dbErr;

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return apiError('id is required', 400);
        }

        await prisma!.workTypeLabel.delete({ where: { id } });

        return apiSuccess({ message: 'Label deleted' });
    } catch (error) {
        console.error('Error deleting work type label:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to delete label');
    }
}
