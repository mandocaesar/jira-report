// Days-only capacity engine. NO hours anywhere — hours live in task-accuracy only.
import { isWeekend, toLocalDateString } from './holiday-service';
import { prisma, isDatabaseAvailable } from './db';
import { Sprint } from '@/types';

export interface EngineMember {
  accountId: string;
  name: string;
  role: 'engineer' | 'qa';
  title: string;
  excluded: boolean;
}

export interface EngineAllocation {
  accountId: string;
  startDate: string;
  endDate: string;
  capacityPercent: number;
}

export interface CapacityInput {
  sprintStart: string;
  sprintEnd: string;
  holidayDates: Set<string>;
  nonDevDates: Set<string>;
  members: EngineMember[];
  leaveDayCounts: Map<string, number>;
  allocations: EngineAllocation[];
}

export interface MemberCapacityDays {
  accountId: string;
  name: string;
  role: 'engineer' | 'qa';
  title: string;
  excluded: boolean;
  sprintWorkingDays: number;
  leaveDays: number;
  allocationFactor: number;
  theoreticalMandays: number;
}

export interface SprintCapacityDays {
  sprintWorkingDays: number;
  members: MemberCapacityDays[];
  teamTheoreticalMandays: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildWorkingDaySet(
  start: string,
  end: string,
  holidays: Set<string>,
  nonDev: Set<string>,
): Set<string> {
  const days = new Set<string>();
  const [y, m, d] = start.split('-').map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d));
  let cur = start;
  while (cur <= end) {
    if (!isWeekend(cur) && !holidays.has(cur) && !nonDev.has(cur)) days.add(cur);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    cur = cursor.toISOString().slice(0, 10);
  }
  return days;
}

function allocationFactorFor(
  accountId: string,
  allocations: EngineAllocation[],
  workingDays: Set<string>,
): number {
  const mine = allocations.filter(a => a.accountId === accountId);
  if (mine.length === 0) return 1;
  if (workingDays.size === 0) return 0;
  let allocatedDays = 0;
  for (const alloc of mine) {
    for (const day of workingDays) {
      if (day >= alloc.startDate && day <= alloc.endDate) {
        allocatedDays += alloc.capacityPercent / 100;
      }
    }
  }
  return allocatedDays / workingDays.size;
}

export function computeSprintCapacity(input: CapacityInput): SprintCapacityDays {
  const workingDays = buildWorkingDaySet(
    input.sprintStart, input.sprintEnd, input.holidayDates, input.nonDevDates,
  );
  const sprintWorkingDays = workingDays.size;

  const members: MemberCapacityDays[] = input.members.map(m => {
    if (m.excluded) {
      return { ...m, sprintWorkingDays, leaveDays: 0, allocationFactor: 0, theoreticalMandays: 0 };
    }
    const leaveDays = Math.max(0, input.leaveDayCounts.get(m.accountId) ?? 0);
    const allocationFactor = round2(allocationFactorFor(m.accountId, input.allocations, workingDays));
    const theoreticalMandays = round2(Math.max(0, sprintWorkingDays * allocationFactor - leaveDays));
    return { ...m, sprintWorkingDays, leaveDays, allocationFactor, theoreticalMandays };
  });

  return {
    sprintWorkingDays,
    members,
    teamTheoreticalMandays: round2(members.reduce((s, m) => s + m.theoreticalMandays, 0)),
  };
}

export { toLocalDateString };

export interface LoadedCapacity {
  teamId: string;
  input: CapacityInput;
  capacity: SprintCapacityDays;
}

/**
 * IO shell: load engine inputs from DB and run the pure core.
 * Returns null only when the DB is unavailable or the team is unknown.
 * DB errors are NOT swallowed — they propagate to the route.
 */
export async function loadSprintCapacity(
  sprint: Sprint,
  by: { teamId?: string; boardId?: number },
): Promise<LoadedCapacity | null> {
  if (!isDatabaseAvailable() || !prisma) return null;

  const team = by.teamId
    ? await prisma.team.findUnique({ where: { id: by.teamId }, include: { members: true } })
    : by.boardId !== undefined
      ? await prisma.team.findUnique({ where: { boardId: by.boardId }, include: { members: true } })
      : null;
  if (!team) return null;

  const sprintStart = toLocalDateString(new Date(sprint.startDate));
  const sprintEnd = toLocalDateString(new Date(sprint.endDate));

  const [holidays, nonDev, leaves, allocations] = await Promise.all([
    prisma.holiday.findMany({
      where: {
        isActive: true,
        date: { gte: new Date(sprintStart + 'T00:00:00Z'), lte: new Date(sprintEnd + 'T00:00:00Z') },
      },
      select: { date: true },
    }),
    prisma.nonDevDay.findMany({
      where: { teamId: team.id, sprintId: sprint.id },
      select: { date: true },
    }),
    prisma.sprintLeave.findMany({ where: { sprintId: sprint.id } }),
    prisma.capacityAllocation.findMany({
      where: {
        teamId: team.id,
        type: 'SPRINT',
        startDate: { lte: new Date(sprintEnd + 'T00:00:00Z') },
        endDate: { gte: new Date(sprintStart + 'T00:00:00Z') },
      },
      include: { teamMember: { select: { accountId: true } } },
    }),
  ]);

  const input: CapacityInput = {
    sprintStart,
    sprintEnd,
    holidayDates: new Set(holidays.map(h => toLocalDateString(h.date))),
    nonDevDates: new Set(nonDev.map(n => toLocalDateString(n.date))),
    members: team.members.map(m => ({
      accountId: m.accountId,
      name: m.name,
      role: (m.role === 'qa' ? 'qa' : 'engineer') as 'engineer' | 'qa',
      title: m.title,
      excluded: m.excludeFromUtilization === true,
    })),
    leaveDayCounts: new Map(leaves.map(l => [l.accountId, l.leaveDays])),
    allocations: allocations.map(a => ({
      accountId: a.teamMember.accountId,
      startDate: toLocalDateString(a.startDate),
      endDate: toLocalDateString(a.endDate),
      capacityPercent: a.capacityPercent,
    })),
  };

  return { teamId: team.id, input, capacity: computeSprintCapacity(input) };
}
