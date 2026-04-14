import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiSuccess, apiError, requireDatabase } from '@/lib/api-helpers';

// GET /api/organisation/leaves — list leaves with filters
export async function GET(request: NextRequest) {
  try {
    const dbErr = requireDatabase(); if (dbErr) return dbErr;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const teamMemberId = searchParams.get('teamMemberId');
    const teamId = searchParams.get('teamId');
    const type = searchParams.get('type');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '50');

    const where: Record<string, unknown> = {};

    if (search) {
      where.teamMember = {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { nik: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    if (teamMemberId) {
      where.teamMemberId = teamMemberId;
    }

    if (teamId) {
      where.teamMember = {
        ...(where.teamMember as Record<string, unknown> || {}),
        teamId,
      };
    }

    if (type) {
      where.type = type;
    }

    // Date range filter: find leaves that overlap with the given range
    if (startDate || endDate) {
      const dateFilter: Record<string, unknown> = {};
      if (startDate) {
        dateFilter.endDate = { gte: new Date(startDate) };
      }
      if (endDate) {
        dateFilter.startDate = { lte: new Date(endDate) };
      }
      Object.assign(where, dateFilter);
    }

    const [leaves, total] = await Promise.all([
      prisma!.leave.findMany({
        where,
        include: {
          teamMember: {
            include: {
              team: {
                include: {
                  department: {
                    include: {
                      division: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { startDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma!.leave.count({ where }),
    ]);

    return apiSuccess(leaves, {
      extra: {
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      },
    });
  } catch (error) {
    console.error('Error fetching leaves:', error);
    return apiError(error instanceof Error ? error.message : 'Failed to fetch leaves', 500);
  }
}

// POST /api/organisation/leaves — create a leave record
export async function POST(request: NextRequest) {
  try {
    const dbErr = requireDatabase(); if (dbErr) return dbErr;

    const body = await request.json();
    const { teamMemberId, startDate, endDate, type, notes } = body;

    if (!teamMemberId || !startDate || !endDate) {
      return apiError('teamMemberId, startDate, and endDate are required', 400);
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (end < start) {
      return apiError('endDate must be on or after startDate', 400);
    }

    // Verify engineer exists
    const member = await prisma!.teamMember.findUnique({ where: { id: teamMemberId } });
    if (!member) {
      return apiError('Engineer not found', 404);
    }

    const leave = await prisma!.leave.create({
      data: {
        teamMemberId,
        startDate: start,
        endDate: end,
        type: type || 'annual',
        notes: notes || null,
      },
      include: {
        teamMember: {
          include: {
            team: {
              include: {
                department: {
                  include: { division: true },
                },
              },
            },
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: leave }, { status: 201 });
  } catch (error) {
    console.error('Error creating leave:', error);
    return apiError(error instanceof Error ? error.message : 'Failed to create leave', 500);
  }
}

// PUT /api/organisation/leaves — update a leave record
export async function PUT(request: NextRequest) {
  try {
    const dbErr = requireDatabase(); if (dbErr) return dbErr;

    const body = await request.json();
    const { id, teamMemberId, startDate, endDate, type, notes } = body;

    if (!id) {
      return apiError('id is required', 400);
    }

    const data: Record<string, unknown> = {};
    if (teamMemberId !== undefined) data.teamMemberId = teamMemberId;
    if (startDate !== undefined) data.startDate = new Date(startDate);
    if (endDate !== undefined) data.endDate = new Date(endDate);
    if (type !== undefined) data.type = type;
    if (notes !== undefined) data.notes = notes || null;

    // Validate date range if both provided or changed
    if (data.startDate && data.endDate && (data.endDate as Date) < (data.startDate as Date)) {
      return apiError('endDate must be on or after startDate', 400);
    }

    const leave = await prisma!.leave.update({
      where: { id },
      data,
      include: {
        teamMember: {
          include: {
            team: {
              include: {
                department: {
                  include: { division: true },
                },
              },
            },
          },
        },
      },
    });

    return apiSuccess(leave);
  } catch (error) {
    console.error('Error updating leave:', error);
    return apiError(error instanceof Error ? error.message : 'Failed to update leave', 500);
  }
}

// DELETE /api/organisation/leaves?id=xxx — delete a leave record
export async function DELETE(request: NextRequest) {
  try {
    const dbErr = requireDatabase(); if (dbErr) return dbErr;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return apiError('id query param is required', 400);
    }

    await prisma!.leave.delete({ where: { id } });

    return apiSuccess({ message: 'Leave deleted' });
  } catch (error) {
    console.error('Error deleting leave:', error);
    return apiError(error instanceof Error ? error.message : 'Failed to delete leave', 500);
  }
}
