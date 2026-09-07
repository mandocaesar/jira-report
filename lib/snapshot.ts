// Closed-sprint snapshot cache (Phase 3). A closed sprint's numbers never
// change, so its API payload is computed once and served from the DB —
// this removes the 10-60s Jira recompute from every closed-sprint view.
// Active/future sprints are never snapshotted. `?refresh=true` recomputes.

import { Prisma } from '@prisma/client';
import { prisma, isDatabaseAvailable } from './db';

export type SnapshotKind = 'check' | 'performance' | 'em-report';

export async function getSnapshot<T>(boardId: number, sprintId: number, kind: SnapshotKind): Promise<{ payload: T; computedAt: Date } | null> {
    if (!isDatabaseAvailable() || !prisma) return null;
    const row = await prisma.sprintSnapshot.findUnique({
        where: { boardId_sprintId_kind: { boardId, sprintId, kind } },
    });
    if (!row) return null;
    return { payload: row.payload as T, computedAt: row.computedAt };
}

export async function saveSnapshot(boardId: number, sprintId: number, kind: SnapshotKind, payload: unknown): Promise<void> {
    if (!isDatabaseAvailable() || !prisma) return;
    try {
        await prisma.sprintSnapshot.upsert({
            where: { boardId_sprintId_kind: { boardId, sprintId, kind } },
            update: { payload: payload as Prisma.InputJsonValue, computedAt: new Date() },
            create: { boardId, sprintId, kind, payload: payload as Prisma.InputJsonValue },
        });
    } catch (error) {
        // Snapshot write failure must never break the response path
        console.error(`Failed to save ${kind} snapshot for sprint ${sprintId}:`, error);
    }
}
