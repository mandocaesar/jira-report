import { NextResponse } from 'next/server';
import { prisma, isDatabaseAvailable } from '@/lib/db';

const HOLIDAY_API_URL = 'https://libur.deno.dev/api';

// POST /api/settings/holidays/import — import holidays from external API for a given year
export async function POST(request: Request) {
    try {
        if (!isDatabaseAvailable() || !prisma) {
            return NextResponse.json(
                { success: false, error: 'Database not configured' },
                { status: 503 }
            );
        }

        const body = await request.json();
        const { year } = body;

        if (!year || typeof year !== 'number') {
            return NextResponse.json(
                { success: false, error: 'year (number) is required' },
                { status: 400 }
            );
        }

        // Fetch from external holiday API
        const response = await fetch(`${HOLIDAY_API_URL}?year=${year}`, {
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
            return NextResponse.json(
                { success: false, error: `Holiday API returned ${response.status}` },
                { status: 502 }
            );
        }

        const rawData: Array<{ date: string; name: string }> = await response.json();

        if (!Array.isArray(rawData) || rawData.length === 0) {
            return NextResponse.json(
                { success: false, error: 'No holidays returned from API' },
                { status: 404 }
            );
        }

        let imported = 0;
        let skipped = 0;

        for (const item of rawData) {
            const parsedDate = new Date(item.date + 'T00:00:00');
            try {
                await prisma.holiday.upsert({
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

        return NextResponse.json({
            success: true,
            data: { imported, skipped, total: rawData.length },
        });
    } catch (error) {
        console.error('Error importing holidays:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Failed to import holidays' },
            { status: 500 }
        );
    }
}
