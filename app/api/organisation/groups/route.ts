import { NextRequest, NextResponse } from 'next/server';
import { prisma, isDatabaseAvailable } from '@/lib/db';

function dbUnavailable() {
  return NextResponse.json(
    { success: false, error: 'Database not configured' },
    { status: 503 }
  );
}

// GET /api/organisation/groups — list all groups
export async function GET() {
  try {
    if (!isDatabaseAvailable() || !prisma) return dbUnavailable();

    const groups = await prisma.orgGroup.findMany({
      include: { _count: { select: { divisions: true } } },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ success: true, data: groups });
  } catch (error) {
    console.error('Error fetching groups:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch groups' },
      { status: 500 }
    );
  }
}

// POST /api/organisation/groups — create a group
export async function POST(request: NextRequest) {
  try {
    if (!isDatabaseAvailable() || !prisma) return dbUnavailable();

    const { name, code } = await request.json();

    if (!name?.trim() || !code?.trim()) {
      return NextResponse.json(
        { success: false, error: 'name and code are required' },
        { status: 400 }
      );
    }

    const group = await prisma.orgGroup.create({
      data: { name: name.trim(), code: code.trim().toUpperCase() },
    });

    return NextResponse.json({ success: true, data: group }, { status: 201 });
  } catch (error) {
    console.error('Error creating group:', error);
    const message = error instanceof Error ? error.message : 'Failed to create group';
    const status = message.includes('Unique constraint') ? 409 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

// PUT /api/organisation/groups — update a group
export async function PUT(request: NextRequest) {
  try {
    if (!isDatabaseAvailable() || !prisma) return dbUnavailable();

    const { id, name, code, isActive } = await request.json();

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

    const group = await prisma.orgGroup.update({ where: { id }, data });

    return NextResponse.json({ success: true, data: group });
  } catch (error) {
    console.error('Error updating group:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update group' },
      { status: 500 }
    );
  }
}

// DELETE /api/organisation/groups?id=X — delete a group
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

    // Check for child divisions
    const divisionCount = await prisma.division.count({ where: { groupId: id } });
    if (divisionCount > 0) {
      return NextResponse.json(
        { success: false, error: `Cannot delete group: it has ${divisionCount} division(s). Remove them first.` },
        { status: 409 }
      );
    }

    await prisma.orgGroup.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting group:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete group' },
      { status: 500 }
    );
  }
}
