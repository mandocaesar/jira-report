import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiSuccess, apiError, requireDatabase } from '@/lib/api-helpers';

// GET /api/organisation/groups — list all groups
export async function GET() {
  try {
    const dbErr = requireDatabase(); if (dbErr) return dbErr;

    const groups = await prisma!.orgGroup.findMany({
      include: { _count: { select: { divisions: true } } },
      orderBy: { name: 'asc' },
    });

    return apiSuccess(groups);
  } catch (error) {
    console.error('Error fetching groups:', error);
    return apiError(error instanceof Error ? error.message : 'Failed to fetch groups', 500);
  }
}

// POST /api/organisation/groups — create a group
export async function POST(request: NextRequest) {
  try {
    const dbErr = requireDatabase(); if (dbErr) return dbErr;

    const { name, code } = await request.json();

    if (!name?.trim() || !code?.trim()) {
      return apiError('name and code are required', 400);
    }

    const group = await prisma!.orgGroup.create({
      data: { name: name.trim(), code: code.trim().toUpperCase() },
    });

    return NextResponse.json({ success: true, data: group }, { status: 201 });
  } catch (error) {
    console.error('Error creating group:', error);
    const message = error instanceof Error ? error.message : 'Failed to create group';
    const status = message.includes('Unique constraint') ? 409 : 500;
    return apiError(message, status);
  }
}

// PUT /api/organisation/groups — update a group
export async function PUT(request: NextRequest) {
  try {
    const dbErr = requireDatabase(); if (dbErr) return dbErr;

    const { id, name, code, isActive } = await request.json();

    if (!id) {
      return apiError('id is required', 400);
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name.trim();
    if (code !== undefined) data.code = code.trim().toUpperCase();
    if (isActive !== undefined) data.isActive = isActive;

    const group = await prisma!.orgGroup.update({ where: { id }, data });

    return apiSuccess(group);
  } catch (error) {
    console.error('Error updating group:', error);
    return apiError(error instanceof Error ? error.message : 'Failed to update group', 500);
  }
}

// DELETE /api/organisation/groups?id=X — delete a group
export async function DELETE(request: NextRequest) {
  try {
    const dbErr = requireDatabase(); if (dbErr) return dbErr;

    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return apiError('id query parameter is required', 400);
    }

    // Check for child divisions
    const divisionCount = await prisma!.division.count({ where: { groupId: id } });
    if (divisionCount > 0) {
      return apiError(`Cannot delete group: it has ${divisionCount} division(s). Remove them first.`, 409);
    }

    await prisma!.orgGroup.delete({ where: { id } });

    return apiSuccess(null);
  } catch (error) {
    console.error('Error deleting group:', error);
    return apiError(error instanceof Error ? error.message : 'Failed to delete group', 500);
  }
}
