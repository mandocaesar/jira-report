import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiSuccess, apiError, requireDatabase } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

// GET /api/organisation/squads/[id]/allocations — list allocations for this squad
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const dbErr = requireDatabase(); if (dbErr) return dbErr;

        const url = new URL(request.url);
        const type = url.searchParams.get('type') || '';
        const memberId = url.searchParams.get('memberId') || '';

        const where: Record<string, unknown> = { teamId: id };
        if (type) where.type = type;
        if (memberId) where.teamMemberId = memberId;

        const allocations = await prisma!.capacityAllocation.findMany({
            where,
            include: {
                teamMember: { select: { id: true, name: true, nik: true, role: true, accountId: true } },
            },
            orderBy: { startDate: 'desc' },
        });

        return apiSuccess(allocations);
    } catch (error) {
        console.error('Error fetching allocations:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to fetch allocations', 500);
    }
}

// POST /api/organisation/squads/[id]/allocations — create allocation with overallocation check
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const dbErr = requireDatabase(); if (dbErr) return dbErr;

        const body = await request.json();
        const { teamMemberId, type, sprintId, startDate, endDate, capacityPercent, notes } = body;

        if (!teamMemberId || !startDate || !endDate) {
            return apiError('teamMemberId, startDate, and endDate are required', 400);
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        if (end < start) {
            return apiError('End date must be after start date', 400);
        }

        const percent = parseInt(capacityPercent) || 100;
        if (percent < 0 || percent > 100) {
            return apiError('Capacity percent must be between 0 and 100', 400);
        }

        // Verify member exists and belongs to this team
        const member = await prisma!.teamMember.findFirst({
            where: { id: teamMemberId, teamId: id },
        });
        if (!member) {
            return apiError('Member not found in this squad', 404);
        }

        // Overallocation check: sum of all overlapping allocations for this member
        const overlapping = await prisma!.capacityAllocation.findMany({
            where: {
                teamMemberId,
                startDate: { lte: end },
                endDate: { gte: start },
            },
        });

        const existingTotal = overlapping.reduce((sum, a) => sum + a.capacityPercent, 0);
        if (existingTotal + percent > 100) {
            return NextResponse.json({
                success: false,
                error: `Overallocation: member already has ${existingTotal}% allocated in overlapping period. Adding ${percent}% would exceed 100%.`,
                existingAllocations: overlapping.map((a) => ({
                    id: a.id,
                    type: a.type,
                    teamId: a.teamId,
                    percent: a.capacityPercent,
                    startDate: a.startDate,
                    endDate: a.endDate,
                })),
            }, { status: 409 });
        }

        const allocation = await prisma!.capacityAllocation.create({
            data: {
                type: type || 'SPRINT',
                teamMemberId,
                teamId: id,
                sprintId: sprintId ? parseInt(sprintId) : null,
                startDate: start,
                endDate: end,
                capacityPercent: percent,
                notes: notes || null,
            },
            include: {
                teamMember: { select: { id: true, name: true, nik: true, role: true, accountId: true } },
            },
        });

        return NextResponse.json({ success: true, data: allocation }, { status: 201 });
    } catch (error) {
        console.error('Error creating allocation:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to create allocation', 500);
    }
}

// PUT /api/organisation/squads/[id]/allocations — update allocation
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const dbErr = requireDatabase(); if (dbErr) return dbErr;

        const body = await request.json();
        const { allocationId, type, sprintId, startDate, endDate, capacityPercent, notes } = body;

        if (!allocationId) {
            return apiError('allocationId is required', 400);
        }

        const existing = await prisma!.capacityAllocation.findFirst({
            where: { id: allocationId, teamId: id },
        });
        if (!existing) {
            return apiError('Allocation not found', 404);
        }

        const updates: Record<string, unknown> = {};
        if (type !== undefined) updates.type = type;
        if (sprintId !== undefined) updates.sprintId = sprintId ? parseInt(sprintId) : null;
        if (notes !== undefined) updates.notes = notes || null;

        const newStart = startDate ? new Date(startDate) : existing.startDate;
        const newEnd = endDate ? new Date(endDate) : existing.endDate;
        if (newEnd < newStart) {
            return apiError('End date must be after start date', 400);
        }
        if (startDate) updates.startDate = newStart;
        if (endDate) updates.endDate = newEnd;

        const newPercent = capacityPercent !== undefined ? parseInt(capacityPercent) : existing.capacityPercent;
        if (newPercent < 0 || newPercent > 100) {
            return apiError('Capacity percent must be between 0 and 100', 400);
        }
        if (capacityPercent !== undefined) updates.capacityPercent = newPercent;

        // Overallocation check (excluding current allocation)
        const overlapping = await prisma!.capacityAllocation.findMany({
            where: {
                teamMemberId: existing.teamMemberId,
                id: { not: allocationId },
                startDate: { lte: newEnd },
                endDate: { gte: newStart },
            },
        });

        const existingTotal = overlapping.reduce((sum, a) => sum + a.capacityPercent, 0);
        if (existingTotal + newPercent > 100) {
            return apiError(`Overallocation: member has ${existingTotal}% from other allocations. Setting ${newPercent}% would exceed 100%.`, 409);
        }

        const updated = await prisma!.capacityAllocation.update({
            where: { id: allocationId },
            data: updates,
            include: {
                teamMember: { select: { id: true, name: true, nik: true, role: true, accountId: true } },
            },
        });

        return apiSuccess(updated);
    } catch (error) {
        console.error('Error updating allocation:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to update allocation', 500);
    }
}

// DELETE /api/organisation/squads/[id]/allocations?allocationId=X
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const dbErr = requireDatabase(); if (dbErr) return dbErr;

        const allocationId = new URL(request.url).searchParams.get('allocationId');
        if (!allocationId) {
            return apiError('allocationId is required', 400);
        }

        const existing = await prisma!.capacityAllocation.findFirst({
            where: { id: allocationId, teamId: id },
        });
        if (!existing) {
            return apiError('Allocation not found', 404);
        }

        await prisma!.capacityAllocation.delete({ where: { id: allocationId } });
        return apiSuccess(null);
    } catch (error) {
        console.error('Error deleting allocation:', error);
        return apiError(error instanceof Error ? error.message : 'Failed to delete allocation', 500);
    }
}
