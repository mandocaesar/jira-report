// Audit trail writer (Phase 2). Every mutating route records who changed
// what. Reads are never logged. Keep payloads small: only the fields that
// changed, as before/after objects.

import { Prisma, PrismaClient } from '@prisma/client';
import { SessionUser } from './authz';

type Db = PrismaClient | Prisma.TransactionClient;

export interface AuditEntry {
    action: string;   // "leave.set" | "report.edit" | "holiday.create" | ...
    entity: string;   // "SprintLeave" | "SprintEmNote" | ...
    entityId: string;
    teamId?: string | null;
    before?: unknown;
    after?: unknown;
}

export async function writeAudit(db: Db, user: SessionUser, entry: AuditEntry): Promise<void> {
    await db.auditLog.create({
        data: {
            userId: user.legacy ? null : user.id,
            userName: user.name,
            action: entry.action,
            entity: entry.entity,
            entityId: entry.entityId,
            teamId: entry.teamId ?? null,
            before: entry.before === undefined ? Prisma.DbNull : (entry.before as Prisma.InputJsonValue),
            after: entry.after === undefined ? Prisma.DbNull : (entry.after as Prisma.InputJsonValue),
        },
    });
}
