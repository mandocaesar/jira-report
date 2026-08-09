import { prisma } from '@/lib/db';
import { apiSuccess, apiError, requireDatabase } from '@/lib/api-helpers';
import { fetchIndonesianHolidays } from '@/lib/holiday-source';

// POST /api/settings/holidays/import — import holidays from external sources for a given year
export async function POST(request: Request) {
    try {
        const dbErr = requireDatabase(); if (dbErr) return dbErr;

        const body = await request.json();
        const { year } = body;

        if (!year || typeof year !== 'number') {
            return apiError('year (number) is required', 400);
        }

        const holidays = await fetchIndonesianHolidays(year);

        if (holidays.length === 0) {
            return apiError(
                `No holidays available for ${year} yet — the official holiday decree may not be published. Add them manually or retry later.`,
                404,
            );
        }

        let imported = 0;
        let skipped = 0;

        for (const item of holidays) {
            // Parse as UTC midnight so the stored @db.Date matches the calendar
            // date regardless of server timezone (local-midnight parsing shifted
            // dates back a day on UTC+ servers).
            const parsedDate = new Date(item.date + 'T00:00:00Z');
            try {
                await prisma!.holiday.upsert({
                    where: { date: parsedDate },
                    update: {}, // Skip — don't overwrite existing
                    create: {
                        date: parsedDate,
                        name: item.name,
                        year,
                        isActive: true,
                    },
                });
                imported++;
            } catch {
                skipped++;
            }
        }

        return apiSuccess({ imported, skipped, total: holidays.length });
    } catch (error) {
        console.error('Error importing holidays:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to import holidays', 500);
    }
}
