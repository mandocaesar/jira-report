import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import teamRoster from '@/config/team-roster.json';

// Helper to find engineer name by accountId
function getEngineerName(accountId: string): string {
    for (const team of Object.values(teamRoster.teams)) {
        const member = (team as any).members.find((m: any) => m.accountId === accountId);
        if (member) return member.name;
    }
    return 'Unknown';
}

// Helper to get team by boardId
function getTeamByBoardId(boardId: number): any {
    return Object.values(teamRoster.teams).find((t: any) => t.boardId === boardId);
}

// GET /api/capacity?accountId=xxx&startDate=2026-02-01&endDate=2026-12-31&boardId=123
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const accountId = searchParams.get('accountId');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const boardId = searchParams.get('boardId');

        if (!prisma) {
            return NextResponse.json(
                { success: false, error: 'Database not available' },
                { status: 503 }
            );
        }

        const where: any = {};

        // Filter by accountId or by team members if boardId is provided
        if (accountId) {
            where.accountId = accountId;
        } else if (boardId) {
            const team = getTeamByBoardId(parseInt(boardId));
            if (team) {
                const accountIds = team.members.map((m: any) => m.accountId);
                where.accountId = { in: accountIds };
            }
        }

        if (startDate && endDate) {
            where.OR = [
                {
                    startDate: {
                        gte: new Date(startDate),
                        lte: new Date(endDate),
                    },
                },
                {
                    endDate: {
                        gte: new Date(startDate),
                        lte: new Date(endDate),
                    },
                },
                {
                    AND: [
                        { startDate: { lte: new Date(startDate) } },
                        { endDate: { gte: new Date(endDate) } },
                    ],
                },
            ];
        }

        const capacityAdjustments = await prisma.engineerCapacity.findMany({
            where,
            orderBy: [{ startDate: 'asc' }],
        });

        // Enrich data with engineer names for UI display
        const enrichedData = capacityAdjustments.map((adj: any) => ({
            id: adj.id,
            engineerId: adj.accountId,
            engineerName: getEngineerName(adj.accountId),
            capacityPercentage: adj.capacity,
            startDate: adj.startDate.toISOString(),
            endDate: adj.endDate.toISOString(),
            reason: adj.reason,
            notes: adj.notes,
        }));

        return NextResponse.json({
            success: true,
            data: enrichedData,
        });
    } catch (error) {
        console.error('Error fetching capacity adjustments:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch capacity adjustments' },
            { status: 500 }
        );
    }
}

// POST /api/capacity
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        // Support both old and new field names
        const accountId = body.accountId || body.engineerId;
        const capacity = body.capacity ?? body.capacityPercentage;
        const { startDate, endDate, reason, notes } = body;

        if (!accountId || !startDate || !endDate || capacity === undefined) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields' },
                { status: 400 }
            );
        }

        if (capacity < 0 || capacity > 100) {
            return NextResponse.json(
                { success: false, error: 'Capacity must be between 0 and 100' },
                { status: 400 }
            );
        }

        if (!prisma) {
            return NextResponse.json(
                { success: false, error: 'Database not available' },
                { status: 503 }
            );
        }

        const capacityAdjustment = await prisma.engineerCapacity.create({
            data: {
                accountId,
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                capacity: parseInt(capacity),
                reason: reason || 'other',
                notes,
            },
        });

        // Return enriched data for UI
        return NextResponse.json({
            success: true,
            data: {
                id: capacityAdjustment.id,
                engineerId: capacityAdjustment.accountId,
                engineerName: getEngineerName(capacityAdjustment.accountId),
                capacityPercentage: capacityAdjustment.capacity,
                startDate: capacityAdjustment.startDate.toISOString(),
                endDate: capacityAdjustment.endDate.toISOString(),
                reason: capacityAdjustment.reason,
                notes: capacityAdjustment.notes,
            },
        });
    } catch (error) {
        console.error('Error creating capacity adjustment:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to create capacity adjustment' },
            { status: 500 }
        );
    }
}

// PUT /api/capacity (update)
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { searchParams } = new URL(request.url);
        const idFromUrl = searchParams.get('id');
        const id = body.id || idFromUrl;

        // Support both old and new field names
        const accountId = body.accountId || body.engineerId;
        const capacity = body.capacity ?? body.capacityPercentage;
        const { startDate, endDate, reason, notes } = body;

        if (!id) {
            return NextResponse.json(
                { success: false, error: 'Missing capacity adjustment ID' },
                { status: 400 }
            );
        }

        if (capacity !== undefined && (capacity < 0 || capacity > 100)) {
            return NextResponse.json(
                { success: false, error: 'Capacity must be between 0 and 100' },
                { status: 400 }
            );
        }

        if (!prisma) {
            return NextResponse.json(
                { success: false, error: 'Database not available' },
                { status: 503 }
            );
        }

        const updateData: any = {};
        if (accountId) updateData.accountId = accountId;
        if (startDate) updateData.startDate = new Date(startDate);
        if (endDate) updateData.endDate = new Date(endDate);
        if (capacity !== undefined) updateData.capacity = parseInt(capacity);
        if (reason) updateData.reason = reason;
        if (notes !== undefined) updateData.notes = notes;

        const capacityAdjustment = await prisma.engineerCapacity.update({
            where: { id },
            data: updateData,
        });

        // Return enriched data for UI
        return NextResponse.json({
            success: true,
            data: {
                id: capacityAdjustment.id,
                engineerId: capacityAdjustment.accountId,
                engineerName: getEngineerName(capacityAdjustment.accountId),
                capacityPercentage: capacityAdjustment.capacity,
                startDate: capacityAdjustment.startDate.toISOString(),
                endDate: capacityAdjustment.endDate.toISOString(),
                reason: capacityAdjustment.reason,
                notes: capacityAdjustment.notes,
            },
        });
    } catch (error) {
        console.error('Error updating capacity adjustment:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to update capacity adjustment' },
            { status: 500 }
        );
    }
}

// DELETE /api/capacity
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { success: false, error: 'Missing capacity adjustment ID' },
                { status: 400 }
            );
        }

        if (!prisma) {
            return NextResponse.json(
                { success: false, error: 'Database not available' },
                { status: 503 }
            );
        }

        await prisma.engineerCapacity.delete({
            where: { id },
        });

        return NextResponse.json({
            success: true,
            message: 'Capacity adjustment deleted',
        });
    } catch (error) {
        console.error('Error deleting capacity adjustment:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to delete capacity adjustment' },
            { status: 500 }
        );
    }
}
