import { prisma } from '@/lib/db';
import { apiSuccess, apiError, requireDatabase } from '@/lib/api-helpers';

// GET /api/settings/holidays — list holidays, optionally by year
export async function GET(request: Request) {
    try {
        const dbErr = requireDatabase();
        if (dbErr) return dbErr;

        const { searchParams } = new URL(request.url);
        const year = searchParams.get('year');

        const where = year ? { year: parseInt(year) } : {};

        const holidays = await prisma!.holiday.findMany({
            where,
            orderBy: { date: 'asc' },
        });

        return apiSuccess(holidays);
    } catch (error) {
        console.error('Error fetching holidays:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to fetch holidays');
    }
}

// POST /api/settings/holidays — create a holiday
export async function POST(request: Request) {
    try {
        const dbErr = requireDatabase();
        if (dbErr) return dbErr;

        const body = await request.json();
        const { date, name, isActive } = body;

        if (!date || !name) {
            return apiError('date and name are required', 400);
        }

        const parsedDate = new Date(date + 'T00:00:00');
        const year = parsedDate.getFullYear();

        const holiday = await prisma!.holiday.create({
            data: {
                date: parsedDate,
                name,
                year,
                isActive: isActive ?? true,
            },
        });

        return apiSuccess(holiday);
    } catch (error) {
        console.error('Error creating holiday:', error);
        const msg = error instanceof Error ? error.message : 'Failed to create holiday';
        return apiError(msg, msg.includes('Unique constraint') ? 409 : 500);
    }
}

// PUT /api/settings/holidays — update a holiday
export async function PUT(request: Request) {
    try {
        const dbErr = requireDatabase();
        if (dbErr) return dbErr;

        const body = await request.json();
        const { id, date, name, isActive } = body;

        if (!id) {
            return apiError('id is required', 400);
        }

        const data: Record<string, unknown> = {};
        if (name !== undefined) data.name = name;
        if (isActive !== undefined) data.isActive = isActive;
        if (date !== undefined) {
            const parsedDate = new Date(date + 'T00:00:00');
            data.date = parsedDate;
            data.year = parsedDate.getFullYear();
        }

        const holiday = await prisma!.holiday.update({
            where: { id },
            data,
        });

        return apiSuccess(holiday);
    } catch (error) {
        console.error('Error updating holiday:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to update holiday');
    }
}

// DELETE /api/settings/holidays — delete a holiday
export async function DELETE(request: Request) {
    try {
        const dbErr = requireDatabase();
        if (dbErr) return dbErr;

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return apiError('id is required', 400);
        }

        await prisma!.holiday.delete({ where: { id } });

        return apiSuccess({ message: 'Holiday deleted' });
    } catch (error) {
        console.error('Error deleting holiday:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to delete holiday');
    }
}
