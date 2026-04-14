import { prisma } from '@/lib/db';
import { apiSuccess, apiError, requireDatabase } from '@/lib/api-helpers';

const HOLIDAY_API_URL = 'https://libur.deno.dev/api';

// POST /api/settings/holidays/import — import holidays from external API for a given year
export async function POST(request: Request) {
    try {
        const dbErr = requireDatabase(); if (dbErr) return dbErr;

        const body = await request.json();
        const { year } = body;

        if (!year || typeof year !== 'number') {
            return apiError('year (number) is required', 400);
        }

        // Fetch from external holiday API
        const response = await fetch(`${HOLIDAY_API_URL}?year=${year}`, {
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
            return apiError(`Holiday API returned ${response.status}`, 502);
        }

        const rawData: Array<{ date: string; name: string }> = await response.json();

        if (!Array.isArray(rawData) || rawData.length === 0) {
            return apiError('No holidays returned from API', 404);
        }

        let imported = 0;
        let skipped = 0;

        for (const item of rawData) {
            const parsedDate = new Date(item.date + 'T00:00:00');
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

        return apiSuccess({ imported, skipped, total: rawData.length });
    } catch (error) {
        console.error('Error importing holidays:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to import holidays', 500);
    }
}
