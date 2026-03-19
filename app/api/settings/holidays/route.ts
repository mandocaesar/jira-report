import { NextResponse } from 'next/server';
import { prisma, isDatabaseAvailable } from '@/lib/db';

// GET /api/settings/holidays — list holidays, optionally by year
export async function GET(request: Request) {
    try {
        if (!isDatabaseAvailable() || !prisma) {
            return NextResponse.json(
                { success: false, error: 'Database not configured' },
                { status: 503 }
            );
        }

        const { searchParams } = new URL(request.url);
        const year = searchParams.get('year');

        const where = year ? { year: parseInt(year) } : {};

        const holidays = await prisma.holiday.findMany({
            where,
            orderBy: { date: 'asc' },
        });

        return NextResponse.json({ success: true, data: holidays });
    } catch (error) {
        console.error('Error fetching holidays:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Failed to fetch holidays' },
            { status: 500 }
        );
    }
}

// POST /api/settings/holidays — create a holiday
export async function POST(request: Request) {
    try {
        if (!isDatabaseAvailable() || !prisma) {
            return NextResponse.json(
                { success: false, error: 'Database not configured' },
                { status: 503 }
            );
        }

        const body = await request.json();
        const { date, name, isActive } = body;

        if (!date || !name) {
            return NextResponse.json(
                { success: false, error: 'date and name are required' },
                { status: 400 }
            );
        }

        const parsedDate = new Date(date + 'T00:00:00');
        const year = parsedDate.getFullYear();

        const holiday = await prisma.holiday.create({
            data: {
                date: parsedDate,
                name,
                year,
                isActive: isActive ?? true,
            },
        });

        return NextResponse.json({ success: true, data: holiday });
    } catch (error) {
        console.error('Error creating holiday:', error);
        const msg = error instanceof Error ? error.message : 'Failed to create holiday';
        const status = msg.includes('Unique constraint') ? 409 : 500;
        return NextResponse.json({ success: false, error: msg }, { status });
    }
}

// PUT /api/settings/holidays — update a holiday
export async function PUT(request: Request) {
    try {
        if (!isDatabaseAvailable() || !prisma) {
            return NextResponse.json(
                { success: false, error: 'Database not configured' },
                { status: 503 }
            );
        }

        const body = await request.json();
        const { id, date, name, isActive } = body;

        if (!id) {
            return NextResponse.json(
                { success: false, error: 'id is required' },
                { status: 400 }
            );
        }

        const data: Record<string, unknown> = {};
        if (name !== undefined) data.name = name;
        if (isActive !== undefined) data.isActive = isActive;
        if (date !== undefined) {
            const parsedDate = new Date(date + 'T00:00:00');
            data.date = parsedDate;
            data.year = parsedDate.getFullYear();
        }

        const holiday = await prisma.holiday.update({
            where: { id },
            data,
        });

        return NextResponse.json({ success: true, data: holiday });
    } catch (error) {
        console.error('Error updating holiday:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Failed to update holiday' },
            { status: 500 }
        );
    }
}

// DELETE /api/settings/holidays — delete a holiday
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

        await prisma.holiday.delete({ where: { id } });

        return NextResponse.json({ success: true, message: 'Holiday deleted' });
    } catch (error) {
        console.error('Error deleting holiday:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Failed to delete holiday' },
            { status: 500 }
        );
    }
}
