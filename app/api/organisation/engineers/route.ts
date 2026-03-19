import { NextRequest, NextResponse } from 'next/server';
import { prisma, isDatabaseAvailable } from '@/lib/db';

// GET /api/organisation/engineers — list engineers with filters and search
export async function GET(request: NextRequest) {
  try {
    if (!isDatabaseAvailable() || !prisma) {
      return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 });
    }

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
      prisma.teamMember.findMany({
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
      prisma.teamMember.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: engineers,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error('Error fetching engineers:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch engineers' },
      { status: 500 }
    );
  }
}

// POST /api/organisation/engineers — create a new engineer
export async function POST(request: NextRequest) {
  try {
    if (!isDatabaseAvailable() || !prisma) {
      return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 });
    }

    const body = await request.json();
    const { accountId, name, email, teamId, role, title, nik, gender, workingHoursPerDay } = body;

    if (!name || !email || !teamId) {
      return NextResponse.json(
        { success: false, error: 'name, email, and teamId are required' },
        { status: 400 }
      );
    }

    // Generate accountId if not provided (for manually-added engineers)
    const finalAccountId = accountId || `manual-${Date.now()}`;

    const engineer = await prisma.teamMember.create({
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
      return NextResponse.json({ success: false, error: 'An engineer with this NIK or account already exists' }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT /api/organisation/engineers — update an engineer
export async function PUT(request: NextRequest) {
  try {
    if (!isDatabaseAvailable() || !prisma) {
      return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 });
    }

    const body = await request.json();
    const { id, name, email, teamId, role, title, nik, gender, workingHoursPerDay } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
    }

    const engineer = await prisma.teamMember.update({
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

    return NextResponse.json({ success: true, data: engineer });
  } catch (error) {
    console.error('Error updating engineer:', error);
    const message = error instanceof Error ? error.message : 'Failed to update engineer';
    if (message.includes('Unique constraint')) {
      return NextResponse.json({ success: false, error: 'An engineer with this NIK already exists' }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE /api/organisation/engineers — delete an engineer (with cascade check)
export async function DELETE(request: NextRequest) {
  try {
    if (!isDatabaseAvailable() || !prisma) {
      return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'id query param is required' }, { status: 400 });
    }

    // Check for related records
    const [leaveCount, allocationCount] = await Promise.all([
      prisma.leave.count({ where: { teamMemberId: id } }),
      prisma.capacityAllocation.count({ where: { teamMemberId: id } }),
    ]);

    if (leaveCount > 0 || allocationCount > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete: engineer has ${leaveCount} leave record(s) and ${allocationCount} allocation(s). Remove those first.`,
        },
        { status: 409 }
      );
    }

    await prisma.teamMember.delete({ where: { id } });

    return NextResponse.json({ success: true, message: 'Engineer deleted' });
  } catch (error) {
    console.error('Error deleting engineer:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete engineer' },
      { status: 500 }
    );
  }
}
