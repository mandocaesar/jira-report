import { NextRequest, NextResponse } from 'next/server';
import { prisma, isDatabaseAvailable } from '@/lib/db';

function dbUnavailable() {
  return NextResponse.json(
    { success: false, error: 'Database not configured' },
    { status: 503 }
  );
}

// GET /api/organisation/departments?divisionId=X — list departments (optionally filtered)
export async function GET(request: NextRequest) {
  try {
    if (!isDatabaseAvailable() || !prisma) return dbUnavailable();

    const divisionId = request.nextUrl.searchParams.get('divisionId');
    const where = divisionId ? { divisionId } : {};

    const departments = await prisma.department.findMany({
      where,
      include: {
        division: { select: { id: true, name: true, group: { select: { id: true, name: true } } } },
        _count: { select: { teams: true } },
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ success: true, data: departments });
  } catch (error) {
    console.error('Error fetching departments:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch departments' },
      { status: 500 }
    );
  }
}

// POST /api/organisation/departments — create a department
export async function POST(request: NextRequest) {
  try {
    if (!isDatabaseAvailable() || !prisma) return dbUnavailable();

    const { name, code, divisionId } = await request.json();

    if (!name?.trim() || !code?.trim() || !divisionId) {
      return NextResponse.json(
        { success: false, error: 'name, code, and divisionId are required' },
        { status: 400 }
      );
    }

    const department = await prisma.department.create({
      data: { name: name.trim(), code: code.trim().toUpperCase(), divisionId },
    });

    return NextResponse.json({ success: true, data: department }, { status: 201 });
  } catch (error) {
    console.error('Error creating department:', error);
    const message = error instanceof Error ? error.message : 'Failed to create department';
    const status = message.includes('Unique constraint') ? 409 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

// PUT /api/organisation/departments — update a department
export async function PUT(request: NextRequest) {
  try {
    if (!isDatabaseAvailable() || !prisma) return dbUnavailable();

    const { id, name, code, isActive, divisionId } = await request.json();

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'id is required' },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name.trim();
    if (code !== undefined) data.code = code.trim().toUpperCase();
    if (isActive !== undefined) data.isActive = isActive;
    if (divisionId !== undefined) data.divisionId = divisionId;

    const department = await prisma.department.update({ where: { id }, data });

    return NextResponse.json({ success: true, data: department });
  } catch (error) {
    console.error('Error updating department:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update department' },
      { status: 500 }
    );
  }
}

// DELETE /api/organisation/departments?id=X — delete a department
export async function DELETE(request: NextRequest) {
  try {
    if (!isDatabaseAvailable() || !prisma) return dbUnavailable();

    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'id query parameter is required' },
        { status: 400 }
      );
    }

    const teamCount = await prisma.team.count({ where: { departmentId: id } });
    if (teamCount > 0) {
      return NextResponse.json(
        { success: false, error: `Cannot delete department: it has ${teamCount} squad(s). Remove them first.` },
        { status: 409 }
      );
    }

    await prisma.department.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting department:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete department' },
      { status: 500 }
    );
  }
}
