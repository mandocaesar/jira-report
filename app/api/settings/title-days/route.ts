import { NextResponse } from 'next/server';
import { prisma, isDatabaseAvailable } from '@/lib/db';

// GET /api/settings/title-days — list all title available days
export async function GET() {
    try {
        if (!isDatabaseAvailable() || !prisma) {
            return NextResponse.json(
                { success: false, error: 'Database not configured' },
                { status: 503 }
            );
        }

        const titleDays = await prisma.titleAvailableDays.findMany({
            orderBy: { title: 'asc' },
        });

        return NextResponse.json({ success: true, data: titleDays });
    } catch (error) {
        console.error('Error fetching title days:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Failed to fetch title days' },
            { status: 500 }
        );
    }
}

// PUT /api/settings/title-days — upsert title available days (bulk)
export async function PUT(request: Request) {
    try {
        if (!isDatabaseAvailable() || !prisma) {
            return NextResponse.json(
                { success: false, error: 'Database not configured' },
                { status: 503 }
            );
        }

        const { entries } = await request.json() as {
            entries: Array<{ title: string; availableDays: number }>;
        };

        if (!entries || !Array.isArray(entries)) {
            return NextResponse.json(
                { success: false, error: 'entries array is required' },
                { status: 400 }
            );
        }

        const db = prisma;
        await db.$transaction(
            entries.map((entry) =>
                db.titleAvailableDays.upsert({
                    where: { title: entry.title },
                    update: { availableDays: entry.availableDays },
                    create: { title: entry.title, availableDays: entry.availableDays },
                })
            )
        );

        return NextResponse.json({ success: true, message: 'Title days saved' });
    } catch (error) {
        console.error('Error saving title days:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Failed to save title days' },
            { status: 500 }
        );
    }
}
