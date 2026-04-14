import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { apiSuccess, apiError, requireDatabase } from '@/lib/api-helpers';
import teamRoster from '@/config/team-roster.json';

function getEngineerName(accountId: string): string {
    for (const team of Object.values(teamRoster.teams)) {
        const member = (team as any).members.find((m: any) => m.accountId === accountId);
        if (member) return member.name;
    }
    return 'Unknown';
}

// PUT /api/capacity/[id] — update a capacity adjustment
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const dbErr = requireDatabase();
        if (dbErr) return dbErr;

        const { id } = await params;
        const body = await request.json();

        const accountId = body.accountId || body.engineerId;
        const capacity = body.capacity ?? body.capacityPercentage;
        const { startDate, endDate, reason, notes } = body;

        if (capacity !== undefined && (capacity < 0 || capacity > 100)) {
            return apiError('Capacity must be between 0 and 100', 400);
        }

        const updateData: Record<string, unknown> = {};
        if (accountId) updateData.accountId = accountId;
        if (startDate) updateData.startDate = new Date(startDate);
        if (endDate) updateData.endDate = new Date(endDate);
        if (capacity !== undefined) updateData.capacity = parseInt(capacity);
        if (reason) updateData.reason = reason;
        if (notes !== undefined) updateData.notes = notes;

        const capacityAdjustment = await prisma!.engineerCapacity.update({
            where: { id },
            data: updateData,
        });

        return apiSuccess({
            id: capacityAdjustment.id,
            engineerId: capacityAdjustment.accountId,
            engineerName: getEngineerName(capacityAdjustment.accountId),
            capacityPercentage: capacityAdjustment.capacity,
            startDate: capacityAdjustment.startDate.toISOString(),
            endDate: capacityAdjustment.endDate.toISOString(),
            reason: capacityAdjustment.reason,
            notes: capacityAdjustment.notes,
        });
    } catch (error) {
        console.error('Error updating capacity adjustment:', error);
        return apiError('Failed to update capacity adjustment');
    }
}

// DELETE /api/capacity/[id] — delete a capacity adjustment
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const dbErr = requireDatabase();
        if (dbErr) return dbErr;

        const { id } = await params;

        await prisma!.engineerCapacity.delete({
            where: { id },
        });

        return apiSuccess({ message: 'Capacity adjustment deleted' });
    } catch (error) {
        console.error('Error deleting capacity adjustment:', error);
        return apiError('Failed to delete capacity adjustment');
    }
}
