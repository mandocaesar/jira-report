import { NextRequest, NextResponse } from 'next/server';
import { prisma, isDatabaseAvailable } from '@/lib/db';

// GET /api/organisation/engineers/[id] — engineer detail with leaves, allocations
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!isDatabaseAvailable() || !prisma) {
      return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 });
    }

    const { id } = await params;

    const engineer = await prisma.teamMember.findUnique({
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
      return NextResponse.json({ success: false, error: 'Engineer not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: engineer });
  } catch (error) {
    console.error('Error fetching engineer detail:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch engineer' },
      { status: 500 }
    );
  }
}
