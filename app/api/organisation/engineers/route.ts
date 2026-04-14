import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiSuccess, apiError, requireDatabase } from '@/lib/api-helpers';

// GET /api/organisation/engineers — list engineers with filters and search
export async function GET(request: NextRequest) {
  try {
    const dbErr = requireDatabase(); if (dbErr) return dbErr;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const teamId = searchParams.get('teamId');
    const departmentId = searchParams.get('departmentId');
    const divisionId = searchParams.get('divisionId');
    const groupId = searchParams.get('groupId');
    const role = searchParams.get('role');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '50');

    const where: Record<string, unknown> = {};

    // Text search on name or NIK
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { nik: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Cascading hierarchy filters
    if (teamId) {
      where.teamId = teamId;
    } else if (departmentId) {
      where.team = { departmentId };
    } else if (divisionId) {
      where.team = { department: { divisionId } };
    } else if (groupId) {
      where.team = { department: { division: { groupId } } };
    }

    if (role) {
      where.role = role;
    }

    const [engineers, total] = await Promise.all([
      prisma!.teamMember.findMany({
        where,
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
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma!.teamMember.count({ where }),
    ]);

    return apiSuccess(engineers, {
      extra: {
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      },
    });
  } catch (error) {
    console.error('Error fetching engineers:', error);
    return apiError(error instanceof Error ? error.message : 'Failed to fetch engineers', 500);
  }
}

// POST /api/organisation/engineers — create a new engineer
export async function POST(request: NextRequest) {
  try {
    const dbErr = requireDatabase(); if (dbErr) return dbErr;

    const body = await request.json();
    const { accountId, name, email, teamId, role, title, nik, gender, workingHoursPerDay, excludeFromUtilization } = body;

    if (!name || !email || !teamId) {
      return apiError('name, email, and teamId are required', 400);
    }

    // Validate workingHoursPerDay
    if (workingHoursPerDay != null) {
      const parsed = parseFloat(workingHoursPerDay);
      if (isNaN(parsed) || parsed < 1 || parsed > 24) {
        return apiError('workingHoursPerDay must be a number between 1 and 24', 400);
      }
    }

    // Generate accountId if not provided (for manually-added engineers)
    const finalAccountId = accountId || `manual-${Date.now()}`;

    const engineer = await prisma!.teamMember.create({
      data: {
        accountId: finalAccountId,
        name,
        email,
        teamId,
        role: role || 'engineer',
        title: title || 'Associate',
        nik: nik || null,
        gender: gender || null,
        ...(workingHoursPerDay != null && { workingHoursPerDay: parseFloat(workingHoursPerDay) }),
        ...(excludeFromUtilization != null && { excludeFromUtilization: Boolean(excludeFromUtilization) }),
      },
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
      },
    });

    return NextResponse.json({ success: true, data: engineer }, { status: 201 });
  } catch (error) {
    console.error('Error creating engineer:', error);
    const message = error instanceof Error ? error.message : 'Failed to create engineer';
    if (message.includes('Unique constraint')) {
      return apiError('An engineer with this NIK or account already exists', 409);
    }
    return apiError(message, 500);
  }
}

// PUT /api/organisation/engineers — update an engineer
export async function PUT(request: NextRequest) {
  try {
    const dbErr = requireDatabase(); if (dbErr) return dbErr;

    const body = await request.json();
    const { id, name, email, teamId, role, title, nik, gender, workingHoursPerDay, excludeFromUtilization } = body;

    if (!id) {
      return apiError('id is required', 400);
    }

    // Validate workingHoursPerDay
    if (workingHoursPerDay !== undefined && workingHoursPerDay !== null) {
      const parsed = parseFloat(workingHoursPerDay);
      if (isNaN(parsed) || parsed < 1 || parsed > 24) {
        return apiError('workingHoursPerDay must be a number between 1 and 24', 400);
      }
    }

    const engineer = await prisma!.teamMember.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(email !== undefined && { email }),
        ...(teamId !== undefined && { teamId }),
        ...(role !== undefined && { role }),
        ...(title !== undefined && { title }),
        ...(nik !== undefined && { nik: nik || null }),
        ...(gender !== undefined && { gender: gender || null }),
        ...(workingHoursPerDay !== undefined && {
          workingHoursPerDay: workingHoursPerDay === null ? null : parseFloat(workingHoursPerDay),
        }),
        ...(excludeFromUtilization !== undefined && { excludeFromUtilization: Boolean(excludeFromUtilization) }),
      },
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
      },
    });

    return apiSuccess(engineer);
  } catch (error) {
    console.error('Error updating engineer:', error);
    const message = error instanceof Error ? error.message : 'Failed to update engineer';
    if (message.includes('Unique constraint')) {
      return apiError('An engineer with this NIK already exists', 409);
    }
    return apiError(message, 500);
  }
}

// DELETE /api/organisation/engineers — delete an engineer (with cascade check)
export async function DELETE(request: NextRequest) {
  try {
    const dbErr = requireDatabase(); if (dbErr) return dbErr;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return apiError('id query param is required', 400);
    }

    // Check for related records
    const [leaveCount, allocationCount] = await Promise.all([
      prisma!.leave.count({ where: { teamMemberId: id } }),
      prisma!.capacityAllocation.count({ where: { teamMemberId: id } }),
    ]);

    if (leaveCount > 0 || allocationCount > 0) {
      return apiError(`Cannot delete: engineer has ${leaveCount} leave record(s) and ${allocationCount} allocation(s). Remove those first.`, 409);
    }

    await prisma!.teamMember.delete({ where: { id } });

    return apiSuccess({ message: 'Engineer deleted' });
  } catch (error) {
    console.error('Error deleting engineer:', error);
    return apiError(error instanceof Error ? error.message : 'Failed to delete engineer', 500);
  }
}
