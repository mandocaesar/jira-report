import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { apiSuccess, apiError, requireDatabase } from '@/lib/api-helpers';

// GET /api/organisation/engineers/[id] — engineer detail with leaves, allocations
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const dbErr = requireDatabase(); if (dbErr) return dbErr;

    const { id } = await params;

    const engineer = await prisma!.teamMember.findUnique({
      where: { id },
      include: {
        team: {
          include: {
            department: {
              include: {
                division: {
                  include: { group: true },
                },
              },
            },
          },
        },
        leaves: {
          orderBy: { startDate: 'desc' },
        },
        capacityAllocations: {
          orderBy: { startDate: 'desc' },
          include: { team: true },
        },
      },
    });

    if (!engineer) {
      return apiError('Engineer not found', 404);
    }

    return apiSuccess(engineer);
  } catch (error) {
    console.error('Error fetching engineer detail:', error);
    return apiError(error instanceof Error ? error.message : 'Failed to fetch engineer', 500);
  }
}
