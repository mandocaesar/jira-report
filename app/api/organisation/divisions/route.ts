import { NextRequest, NextResponse } from 'next/server';
import { prisma, isDatabaseAvailable } from '@/lib/db';

function dbUnavailable() {
  return NextResponse.json(
    { success: false, error: 'Database not configured' },
    { status: 503 }
  );
}

// GET /api/organisation/divisions?groupId=X — list divisions (optionally filtered)
export async function GET(request: NextRequest) {
  try {
    if (!isDatabaseAvailable() || !prisma) return dbUnavailable();

    const groupId = request.nextUrl.searchParams.get('groupId');
    const where = groupId ? { groupId } : {};

    const divisions = await prisma.division.findMany({
      where,
      include: {
        group: { select: { id: true, name: true } },
        _count: { select: { departments: true } },
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ success: true, data: divisions });
  } catch (error) {
    console.error('Error fetching divisions:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch divisions' },
      { status: 500 }
    );
  }
}

// POST /api/organisation/divisions — create a division
export async function POST(request: NextRequest) {
  try {
    if (!isDatabaseAvailable() || !prisma) return dbUnavailable();

    const { name, code, groupId } = await request.json();

    if (!name?.trim() || !code?.trim() || !groupId) {
      return NextResponse.json(
        { success: false, error: 'name, code, and groupId are required' },
        { status: 400 }
      );
    }

    const division = await prisma.division.create({
      data: { name: name.trim(), code: code.trim().toUpperCase(), groupId },
    });

    return NextResponse.json({ success: true, data: division }, { status: 201 });
  } catch (error) {
    console.error('Error creating division:', error);
    const message = error instanceof Error ? error.message : 'Failed to create division';
    const status = message.includes('Unique constraint') ? 409 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

// PUT /api/organisation/divisions — update a division
export async function PUT(request: NextRequest) {
  try {
    if (!isDatabaseAvailable() || !prisma) return dbUnavailable();

    const { id, name, code, isActive, groupId } = await request.json();

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
    if (groupId !== undefined) data.groupId = groupId;

    const division = await prisma.division.update({ where: { id }, data });

    return NextResponse.json({ success: true, data: division });
  } catch (error) {
    console.error('Error updating division:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update division' },
      { status: 500 }
    );
  }
}

// DELETE /api/organisation/divisions?id=X — delete a division
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

    const deptCount = await prisma.department.count({ where: { divisionId: id } });
    if (deptCount > 0) {
      return NextResponse.json(
        { success: false, error: `Cannot delete division: it has ${deptCount} department(s). Remove them first.` },
        { status: 409 }
      );
    }

    await prisma.division.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting division:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete division' },
      { status: 500 }
    );
  }
}
