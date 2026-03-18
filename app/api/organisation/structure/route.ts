import { NextResponse } from 'next/server';
import { prisma, isDatabaseAvailable } from '@/lib/db';

// GET /api/organisation/structure — full org tree
export async function GET() {
  try {
    if (!isDatabaseAvailable() || !prisma) {
      return NextResponse.json(
        { success: false, error: 'Database not configured' },
        { status: 503 }
      );
    }

    const groups = await prisma.orgGroup.findMany({
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

    return NextResponse.json({ success: true, data: groups });
  } catch (error) {
    console.error('Error fetching org structure:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch organisation structure' },
      { status: 500 }
    );
  }
}
