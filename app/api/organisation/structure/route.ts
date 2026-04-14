import { prisma } from '@/lib/db';
import { apiSuccess, apiError, requireDatabase } from '@/lib/api-helpers';

// GET /api/organisation/structure — full org tree
export async function GET() {
  try {
    const dbErr = requireDatabase(); if (dbErr) return dbErr;

    const groups = await prisma!.orgGroup.findMany({
      include: {
        divisions: {
          include: {
            departments: {
              include: {
                teams: {
                  include: { _count: { select: { members: true } } },
                  orderBy: { name: 'asc' },
                },
              },
              orderBy: { name: 'asc' },
            },
          },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    return apiSuccess(groups);
  } catch (error) {
    console.error('Error fetching org structure:', error);
    return apiError(error instanceof Error ? error.message : 'Failed to fetch organisation structure', 500);
  }
}
