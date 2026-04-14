import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiSuccess, apiError, requireDatabase } from '@/lib/api-helpers';

// GET /api/organisation/divisions?groupId=X — list divisions (optionally filtered)
export async function GET(request: NextRequest) {
  try {
    const dbErr = requireDatabase(); if (dbErr) return dbErr;

    const groupId = request.nextUrl.searchParams.get('groupId');
    const where = groupId ? { groupId } : {};

    const divisions = await prisma!.division.findMany({
      where,
      include: {
        group: { select: { id: true, name: true } },
        _count: { select: { departments: true } },
      },
      orderBy: { name: 'asc' },
    });

    return apiSuccess(divisions);
  } catch (error) {
    console.error('Error fetching divisions:', error);
    return apiError(error instanceof Error ? error.message : 'Failed to fetch divisions', 500);
  }
}

// POST /api/organisation/divisions — create a division
export async function POST(request: NextRequest) {
  try {
    const dbErr = requireDatabase(); if (dbErr) return dbErr;

    const { name, code, groupId } = await request.json();

    if (!name?.trim() || !code?.trim() || !groupId) {
      return apiError('name, code, and groupId are required', 400);
    }

    const division = await prisma!.division.create({
      data: { name: name.trim(), code: code.trim().toUpperCase(), groupId },
    });

    return NextResponse.json({ success: true, data: division }, { status: 201 });
  } catch (error) {
    console.error('Error creating division:', error);
    const message = error instanceof Error ? error.message : 'Failed to create division';
    const status = message.includes('Unique constraint') ? 409 : 500;
    return apiError(message, status);
  }
}

// PUT /api/organisation/divisions — update a division
export async function PUT(request: NextRequest) {
  try {
    const dbErr = requireDatabase(); if (dbErr) return dbErr;

    const { id, name, code, isActive, groupId } = await request.json();

    if (!id) {
      return apiError('id is required', 400);
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name.trim();
    if (code !== undefined) data.code = code.trim().toUpperCase();
    if (isActive !== undefined) data.isActive = isActive;
    if (groupId !== undefined) data.groupId = groupId;

    const division = await prisma!.division.update({ where: { id }, data });

    return apiSuccess(division);
  } catch (error) {
    console.error('Error updating division:', error);
    return apiError(error instanceof Error ? error.message : 'Failed to update division', 500);
  }
}

// DELETE /api/organisation/divisions?id=X — delete a division
export async function DELETE(request: NextRequest) {
  try {
    const dbErr = requireDatabase(); if (dbErr) return dbErr;

    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return apiError('id query parameter is required', 400);
    }

    const deptCount = await prisma!.department.count({ where: { divisionId: id } });
    if (deptCount > 0) {
      return apiError(`Cannot delete division: it has ${deptCount} department(s). Remove them first.`, 409);
    }

    await prisma!.division.delete({ where: { id } });

    return apiSuccess(null);
  } catch (error) {
    console.error('Error deleting division:', error);
    return apiError(error instanceof Error ? error.message : 'Failed to delete division', 500);
  }
}
