import { NextResponse } from 'next/server';
import { prisma, isDatabaseAvailable } from '@/lib/db';

// GET /api/leave?sprintId=123
export async function GET(request: Request) {
    try {
        if (!isDatabaseAvailable()) {
            return NextResponse.json(
                { success: false, error: 'Database not configured. Please set POSTGRES_PRISMA_URL in .env.local' },
                { status: 503 }
            );
        }

        const { searchParams } = new URL(request.url);
        const sprintIdParam = searchParams.get('sprintId');

        if (!sprintIdParam) {
            return NextResponse.json(
                { success: false, error: 'sprintId is required' },
                { status: 400 }
            );
        }

        const sprintId = parseInt(sprintIdParam);

        // Fetch all leave entries for the sprint
        if (!prisma) {
            return NextResponse.json(
                { success: false, error: 'Database client not initialized' },
                { status: 503 }
            );
        }

        const leaveEntries = await prisma.sprintLeave.findMany({
            where: { sprintId },
        });

        // Convert to a map for easier frontend consumption
        const leaveMap: Record<string, number> = {};
        leaveEntries.forEach((entry: { accountId: string; leaveDays: number }) => {
            leaveMap[entry.accountId] = entry.leaveDays;
        });

        return NextResponse.json({
            success: true,
            data: leaveMap,
        });
    } catch (error) {
        console.error('Error fetching sprint leave:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to fetch sprint leave',
            },
            { status: 500 }
        );
    }
}

// PUT /api/leave
export async function PUT(request: Request) {
    try {
        if (!isDatabaseAvailable()) {
            return NextResponse.json(
                { success: false, error: 'Database not configured. Please set POSTGRES_PRISMA_URL in .env.local' },
                { status: 503 }
            );
        }

        const body = await request.json();
        const { sprintId, leaveData } = body;

        if (!sprintId || !leaveData) {
            return NextResponse.json(
                { success: false, error: 'sprintId and leaveData are required' },
                { status: 400 }
            );
        }

        // leaveData is a map: { accountId: leaveDays, ... }
        const updates = Object.entries(leaveData as Record<string, number>).map(
            ([accountId, leaveDays]) => ({
                sprintId: parseInt(sprintId),
                accountId,
                leaveDays: parseInt(leaveDays as any),
            })
        );

        if (!prisma) {
            return NextResponse.json(
                { success: false, error: 'Database client not initialized' },
                { status: 503 }
            );
        }

        // Upsert all leave entries in a transaction
        const db = prisma; // TypeScript null check
        await db.$transaction(
            updates.map((data) =>
                db.sprintLeave.upsert({
                    where: {
                        sprintId_accountId: {
                            sprintId: data.sprintId,
                            accountId: data.accountId,
                        },
                    },
                    update: {
                        leaveDays: data.leaveDays,
                    },
                    create: data,
                })
            )
        );

        return NextResponse.json({
            success: true,
            message: 'Leave data saved successfully',
        });
    } catch (error) {
        console.error('Error saving sprint leave:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to save sprint leave',
            },
            { status: 500 }
        );
    }
}
