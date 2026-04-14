import { prisma } from '@/lib/db';
import { apiSuccess, apiError, requireDatabase } from '@/lib/api-helpers';

// GET /api/settings/title-days — list all title available days
export async function GET() {
    try {
        const dbErr = requireDatabase();
        if (dbErr) return dbErr;

        const titleDays = await prisma!.titleAvailableDays.findMany({
            orderBy: { title: 'asc' },
        });

        return apiSuccess(titleDays);
    } catch (error) {
        console.error('Error fetching title days:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to fetch title days');
    }
}

// PUT /api/settings/title-days — upsert title available days (bulk)
export async function PUT(request: Request) {
    try {
        const dbErr = requireDatabase();
        if (dbErr) return dbErr;

        const { entries } = await request.json() as {
            entries: Array<{ title: string; availableDays: number }>;
        };

        if (!entries || !Array.isArray(entries)) {
            return apiError('entries array is required', 400);
        }

        const db = prisma!;
        await db.$transaction(
            entries.map((entry) =>
                db.titleAvailableDays.upsert({
                    where: { title: entry.title },
                    update: { availableDays: entry.availableDays },
                    create: { title: entry.title, availableDays: entry.availableDays },
                })
            )
        );

        return apiSuccess({ message: 'Title days saved' });
    } catch (error) {
        console.error('Error saving title days:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to save title days');
    }
}
