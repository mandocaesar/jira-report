import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { apiSuccess, apiError, requireDatabase } from '@/lib/api-helpers';
import { getSessionUser, can } from '@/lib/authz';
import { writeAudit } from '@/lib/audit';

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
export async function POST(request: NextRequest) {
    try {
        const dbErr = requireDatabase();
        if (dbErr) return dbErr;

        const user = await getSessionUser(request);
        if (!user) return apiError('Not authenticated', 401);
        if (!can(user, 'admin_settings')) return apiError('Holiday management is admin-only', 403);

        const body = await request.json();
        const { date, name, isActive } = body;

        if (!date || !name) {
            return apiError('date and name are required', 400);
        }

        // UTC midnight — local-midnight parsing stores the previous day on UTC+ servers
        const parsedDate = new Date(date + 'T00:00:00Z');
        const year = parsedDate.getUTCFullYear();

        const holiday = await prisma!.holiday.create({
            data: {
                date: parsedDate,
                name,
                year,
                isActive: isActive ?? true,
            },
        });

        await writeAudit(prisma!, user, { action: 'holiday.create', entity: 'Holiday', entityId: holiday.id, after: { date, name: holiday.name } });
        return apiSuccess(holiday);
    } catch (error) {
        console.error('Error creating holiday:', error);
        const msg = error instanceof Error ? error.message : 'Failed to create holiday';
        return apiError(msg, msg.includes('Unique constraint') ? 409 : 500);
    }
}

// PUT /api/settings/holidays — update a holiday
export async function PUT(request: NextRequest) {
    try {
        const dbErr = requireDatabase();
        if (dbErr) return dbErr;

        const user = await getSessionUser(request);
        if (!user) return apiError('Not authenticated', 401);
        if (!can(user, 'admin_settings')) return apiError('Holiday management is admin-only', 403);

        const body = await request.json();
        const { id, date, name, isActive } = body;

        if (!id) {
            return apiError('id is required', 400);
        }

        const data: Record<string, unknown> = {};
        if (name !== undefined) data.name = name;
        if (isActive !== undefined) data.isActive = isActive;
        if (date !== undefined) {
            const parsedDate = new Date(date + 'T00:00:00Z');
            data.date = parsedDate;
            data.year = parsedDate.getUTCFullYear();
        }

        const holiday = await prisma!.holiday.update({
            where: { id },
            data,
        });

        await writeAudit(prisma!, user, { action: 'holiday.update', entity: 'Holiday', entityId: holiday.id, after: data });
        return apiSuccess(holiday);
    } catch (error) {
        console.error('Error updating holiday:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to update holiday');
    }
}

// DELETE /api/settings/holidays — delete a holiday
export async function DELETE(request: NextRequest) {
    try {
        const dbErr = requireDatabase();
        if (dbErr) return dbErr;

        const user = await getSessionUser(request);
        if (!user) return apiError('Not authenticated', 401);
        if (!can(user, 'admin_settings')) return apiError('Holiday management is admin-only', 403);

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return apiError('id is required', 400);
        }

        const removed = await prisma!.holiday.delete({ where: { id } });
        await writeAudit(prisma!, user, { action: 'holiday.delete', entity: 'Holiday', entityId: id, before: { date: removed.date, name: removed.name } });

        return apiSuccess({ message: 'Holiday deleted' });
    } catch (error) {
        console.error('Error deleting holiday:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to delete holiday');
    }
}
