import { prisma, isDatabaseAvailable } from './db';
import { toLocalDateString, isWeekend } from './holiday-service';
import { Sprint } from '@/types';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface MemberCapacity {
  accountId: string;
  name: string;
  role: 'qa' | 'engineer';
  title: string;
  workingHoursPerDay: number;
  /** Total calendar working days in sprint (excl weekends/holidays/non-dev) for this member */
  totalWorkingDays: number;
  /** Working days minus leave */
  availableDays: number;
  leaveDays: number;
  /** availableDays × workingHoursPerDay */
  availableHours: number;
  /** Sum of allocated hours from all SPRINT allocations for this member in this sprint */
  allocatedHours: number;
  /** Capacity percent weighted average across allocations (or 100 if no allocations) */
  capacityPercent: number;
  /** availableHours normalized to team standard: availableHours / teamStandardHours */
  effectiveMandays: number;
}

export interface SprintCapacity {
  sprintId: number;
  sprintName: string;
  teamId: string;
  teamStandardHours: number;
  /** Calendar working days for the sprint (excl weekends + holidays + non-dev days) */
  sprintWorkingDays: number;
  /** Total team capacity hours (sum of all member allocatedHours) */
  totalCapacityHours: number;
  /** Total available hours (sum of all member availableHours) */
  totalAvailableHours: number;
  /** Total effective mandays (sum of all member effectiveMandays) */
  totalEffectiveMandays: number;
  /** Per-member breakdown */
  members: MemberCapacity[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function parseDateString(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Get set of YYYY-MM-DD date strings for holidays active in DB in a date range */
async function getActiveHolidayDates(startStr: string, endStr: string): Promise<Set<string>> {
  const set = new Set<string>();
  if (!isDatabaseAvailable() || !prisma) return set;

  const holidays = await prisma.holiday.findMany({
    where: {
      isActive: true,
      date: { gte: parseDateString(startStr), lte: parseDateString(endStr) },
    },
    select: { date: true },
  });
  for (const h of holidays) {
    set.add(toLocalDateString(h.date));
  }
  return set;
}

/** Get set of YYYY-MM-DD date strings for non-dev days for a team/sprint */
async function getNonDevDayDates(teamId: string, sprintId: number): Promise<Set<string>> {
  const set = new Set<string>();
  if (!isDatabaseAvailable() || !prisma) return set;

  const nonDevDays = await prisma.nonDevDay.findMany({
    where: { teamId, sprintId },
    select: { date: true },
  });
  for (const nd of nonDevDays) {
    set.add(toLocalDateString(nd.date));
  }
  return set;
}

/** Get leave date sets per member (accountId → Set of YYYY-MM-DD) */
async function getMemberLeaveDates(
  memberIds: string[],
  startStr: string,
  endStr: string
): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  if (!isDatabaseAvailable() || !prisma || memberIds.length === 0) return map;

  const leaves = await prisma.leave.findMany({
    where: {
      teamMemberId: { in: memberIds },
      startDate: { lte: parseDateString(endStr) },
      endDate: { gte: parseDateString(startStr) },
    },
    select: { teamMemberId: true, startDate: true, endDate: true },
  });

  for (const leave of leaves) {
    if (!map.has(leave.teamMemberId)) {
      map.set(leave.teamMemberId, new Set());
    }
    const leaveSet = map.get(leave.teamMemberId)!;
    // Iterate dates within leave range that overlap with sprint
    const leaveStart = toLocalDateString(leave.startDate);
    const leaveEnd = toLocalDateString(leave.endDate);
    const effStart = leaveStart > startStr ? leaveStart : startStr;
    const effEnd = leaveEnd < endStr ? leaveEnd : endStr;

    const [sy, sm, sd] = effStart.split('-').map(Number);
    const cur = new Date(sy, sm - 1, sd);
    let curStr = effStart;
    while (curStr <= effEnd) {
      leaveSet.add(curStr);
      cur.setDate(cur.getDate() + 1);
      curStr = toLocalDateString(cur);
    }
  }

  return map;
}

/** Build a Set of working day strings excluding weekends, holidays, and non-dev days */
function buildBaseWorkingDaySet(
  startStr: string,
  endStr: string,
  holidayDates: Set<string>,
  nonDevDates: Set<string>
): Set<string> {
  const set = new Set<string>();
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const cur = new Date(sy, sm - 1, sd);
  let curStr = startStr;
  while (curStr <= endStr) {
    if (!isWeekend(curStr) && !holidayDates.has(curStr) && !nonDevDates.has(curStr)) {
      set.add(curStr);
    }
    cur.setDate(cur.getDate() + 1);
    curStr = toLocalDateString(cur);
  }
  return set;
}

/** Count working days in a date range excluding weekends, holidays, and non-dev days */
function countWorkingDays(
  startStr: string,
  endStr: string,
  holidayDates: Set<string>,
  nonDevDates: Set<string>
): number {
  return buildBaseWorkingDaySet(startStr, endStr, holidayDates, nonDevDates).size;
}

/** Count member available days using pre-built base working day set */
function countMemberAvailableDaysFromSet(
  baseWorkingDays: Set<string>,
  leaveDates: Set<string>
): { availableDays: number; leaveDays: number } {
  let availableDays = 0;
  let leaveDays = 0;
  for (const d of baseWorkingDays) {
    if (leaveDates.has(d)) {
      leaveDays++;
    } else {
      availableDays++;
    }
  }
  return { availableDays, leaveDays };
}

/** Count working days in overlap window using pre-built base working day set */
function countOverlapWorkingDays(
  overlapStart: string,
  overlapEnd: string,
  baseWorkingDays: Set<string>,
  leaveDates: Set<string>
): number {
  let count = 0;
  for (const d of baseWorkingDays) {
    if (d >= overlapStart && d <= overlapEnd && !leaveDates.has(d)) {
      count++;
    }
  }
  return count;
}

// ─── Prorated Allocation Calculator ────────────────────────────────────────────

interface AllocationRecord {
  teamMemberId: string;
  startDate: Date;
  endDate: Date;
  capacityPercent: number;
  type: string;
}

/**
 * Calculate prorated allocated hours for a member's allocation within a sprint.
 *
 * Formula (from spec):
 * 1. Determine allocation date range
 * 2. Determine sprint date range
 * 3. Calculate overlap
 * 4. Count working days in overlap (excl weekends/holidays/non-dev/leave)
 * 5. allocatedHours = workingDaysInOverlap × workingHoursPerDay × (capacityPercent/100)
 */
function calculateProratedHours(
  allocation: AllocationRecord,
  sprintStartStr: string,
  sprintEndStr: string,
  workingHoursPerDay: number,
  baseWorkingDays: Set<string>,
  leaveDates: Set<string>
): number {
  const allocStartStr = toLocalDateString(allocation.startDate);
  const allocEndStr = toLocalDateString(allocation.endDate);

  const overlapStart = allocStartStr > sprintStartStr ? allocStartStr : sprintStartStr;
  const overlapEnd = allocEndStr < sprintEndStr ? allocEndStr : sprintEndStr;

  if (overlapStart > overlapEnd) return 0;

  const workingDaysInOverlap = countOverlapWorkingDays(overlapStart, overlapEnd, baseWorkingDays, leaveDates);
  return workingDaysInOverlap * workingHoursPerDay * (allocation.capacityPercent / 100);
}

// ─── Main Pipeline ─────────────────────────────────────────────────────────────

/**
 * Calculate capacity for a sprint using the prorated allocation pipeline.
 *
 * This uses DB models: Team, TeamMember, CapacityAllocation, NonDevDay, Holiday, Leave.
 * Falls back gracefully when no allocations exist (treats as 100% allocated).
 */
export async function calculateSprintCapacity(
  sprint: Sprint,
  teamId: string
): Promise<SprintCapacity | null> {
  if (!isDatabaseAvailable() || !prisma) return null;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { members: true },
  });
  if (!team) return null;

  const sprintStartStr = toLocalDateString(new Date(sprint.startDate));
  const sprintEndStr = toLocalDateString(new Date(sprint.endDate));
  const teamStandardHours = team.workingHoursPerDay;

  // Fetch exclusion data in parallel
  const memberDbIds = team.members.map(m => m.id);
  const [holidayDates, nonDevDates, memberLeaveMap] = await Promise.all([
    getActiveHolidayDates(sprintStartStr, sprintEndStr),
    getNonDevDayDates(teamId, sprint.id),
    getMemberLeaveDates(memberDbIds, sprintStartStr, sprintEndStr),
  ]);

  // Fetch SPRINT allocations that overlap with sprint dates
  const allocations = await prisma.capacityAllocation.findMany({
    where: {
      teamId,
      type: 'SPRINT',
      startDate: { lte: parseDateString(sprintEndStr) },
      endDate: { gte: parseDateString(sprintStartStr) },
    },
  });

  // Group allocations by team member DB ID
  const allocationsByMember = new Map<string, AllocationRecord[]>();
  for (const alloc of allocations) {
    const list = allocationsByMember.get(alloc.teamMemberId) || [];
    list.push({
      teamMemberId: alloc.teamMemberId,
      startDate: alloc.startDate,
      endDate: alloc.endDate,
      capacityPercent: alloc.capacityPercent,
      type: alloc.type,
    });
    allocationsByMember.set(alloc.teamMemberId, list);
  }

  // Sprint-level working days (before per-member leave)
  // Pre-compute base working day set once for O(d) instead of O(d) per member
  const baseWorkingDays = buildBaseWorkingDaySet(sprintStartStr, sprintEndStr, holidayDates, nonDevDates);
  const sprintWorkingDays = baseWorkingDays.size;

  const members: MemberCapacity[] = [];

  for (const member of team.members) {
    const memberHoursPerDay = member.workingHoursPerDay ?? teamStandardHours;
    const leaveDates = memberLeaveMap.get(member.id) || new Set<string>();

    const { availableDays, leaveDays } = countMemberAvailableDaysFromSet(baseWorkingDays, leaveDates);

    const availableHours = availableDays * memberHoursPerDay;
    const effectiveMandays = teamStandardHours > 0 ? availableHours / teamStandardHours : availableDays;

    // Calculate allocated hours via prorated allocation
    const memberAllocations = allocationsByMember.get(member.id);
    let allocatedHours: number;
    let capacityPercent: number;

    if (memberAllocations && memberAllocations.length > 0) {
      // Sum prorated hours from all SPRINT allocations
      allocatedHours = 0;
      for (const alloc of memberAllocations) {
        allocatedHours += calculateProratedHours(
          alloc,
          sprintStartStr,
          sprintEndStr,
          memberHoursPerDay,
          baseWorkingDays,
          leaveDates
        );
      }
      // Weighted capacity percent
      capacityPercent = availableHours > 0
        ? Math.round((allocatedHours / availableHours) * 100)
        : 0;
    } else {
      // No allocations → treat as 100% allocated
      allocatedHours = availableHours;
      capacityPercent = 100;
    }

    members.push({
      accountId: member.accountId,
      name: member.name,
      role: member.role as 'qa' | 'engineer',
      title: member.title,
      workingHoursPerDay: memberHoursPerDay,
      totalWorkingDays: sprintWorkingDays,
      availableDays,
      leaveDays,
      availableHours,
      allocatedHours,
      capacityPercent,
      effectiveMandays,
    });
  }

  const totalCapacityHours = members.reduce((s, m) => s + m.allocatedHours, 0);
  const totalAvailableHours = members.reduce((s, m) => s + m.availableHours, 0);
  const totalEffectiveMandays = members.reduce((s, m) => s + m.effectiveMandays, 0);

  return {
    sprintId: sprint.id,
    sprintName: sprint.name,
    teamId,
    teamStandardHours,
    sprintWorkingDays,
    totalCapacityHours,
    totalAvailableHours,
    totalEffectiveMandays,
    members,
  };
}

/**
 * Calculate capacity for multiple sprints in batch.
 * Fetches the team once and batches holiday/leave queries across the full date range.
 */
export async function calculateSprintCapacityBatch(
  sprints: Sprint[],
  teamId: string
): Promise<Map<number, SprintCapacity | null>> {
  const result = new Map<number, SprintCapacity | null>();
  if (!isDatabaseAvailable() || !prisma || sprints.length === 0) {
    for (const s of sprints) result.set(s.id, null);
    return result;
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { members: true },
  });
  if (!team) {
    for (const s of sprints) result.set(s.id, null);
    return result;
  }

  // Find the widest date range across all sprints
  let globalStart = '9999-12-31';
  let globalEnd = '0000-01-01';
  const sprintDates = new Map<number, { startStr: string; endStr: string }>();
  for (const sprint of sprints) {
    if (!sprint.startDate || !sprint.endDate) { result.set(sprint.id, null); continue; }
    const startStr = toLocalDateString(new Date(sprint.startDate));
    const endStr = toLocalDateString(new Date(sprint.endDate));
    sprintDates.set(sprint.id, { startStr, endStr });
    if (startStr < globalStart) globalStart = startStr;
    if (endStr > globalEnd) globalEnd = endStr;
  }

  const memberDbIds = team.members.map(m => m.id);
  const teamStandardHours = team.workingHoursPerDay;

  // Batch: holidays across full range, all non-dev days for this team, all leaves
  const [holidayDates, allNonDevDays, memberLeaveMap, allAllocations] = await Promise.all([
    getActiveHolidayDates(globalStart, globalEnd),
    (async () => {
      if (!prisma) return [];
      return prisma.nonDevDay.findMany({
        where: { teamId, sprintId: { in: sprints.map(s => s.id) } },
        select: { sprintId: true, date: true },
      });
    })(),
    getMemberLeaveDates(memberDbIds, globalStart, globalEnd),
    (async () => {
      if (!prisma) return [];
      return prisma.capacityAllocation.findMany({
        where: {
          teamId,
          type: 'SPRINT',
          startDate: { lte: parseDateString(globalEnd) },
          endDate: { gte: parseDateString(globalStart) },
        },
      });
    })(),
  ]);

  // Index non-dev days by sprint
  const nonDevBySprintId = new Map<number, Set<string>>();
  for (const nd of allNonDevDays) {
    if (!nonDevBySprintId.has(nd.sprintId)) nonDevBySprintId.set(nd.sprintId, new Set());
    nonDevBySprintId.get(nd.sprintId)!.add(toLocalDateString(nd.date));
  }

  // Index allocations by member DB ID
  const allocationsByMember = new Map<string, AllocationRecord[]>();
  for (const alloc of allAllocations) {
    const list = allocationsByMember.get(alloc.teamMemberId) || [];
    list.push({
      teamMemberId: alloc.teamMemberId,
      startDate: alloc.startDate,
      endDate: alloc.endDate,
      capacityPercent: alloc.capacityPercent,
      type: alloc.type,
    });
    allocationsByMember.set(alloc.teamMemberId, list);
  }

  for (const sprint of sprints) {
    const dates = sprintDates.get(sprint.id);
    if (!dates) continue;
    const { startStr, endStr } = dates;
    const nonDevDates = nonDevBySprintId.get(sprint.id) || new Set<string>();

    const baseWorkingDays = buildBaseWorkingDaySet(startStr, endStr, holidayDates, nonDevDates);
    const sprintWorkingDays = baseWorkingDays.size;

    const members: MemberCapacity[] = [];
    for (const member of team.members) {
      const memberHoursPerDay = member.workingHoursPerDay ?? teamStandardHours;
      const leaveDates = memberLeaveMap.get(member.id) || new Set<string>();
      const { availableDays, leaveDays } = countMemberAvailableDaysFromSet(baseWorkingDays, leaveDates);
      const availableHours = availableDays * memberHoursPerDay;
      const effectiveMandays = teamStandardHours > 0 ? availableHours / teamStandardHours : availableDays;

      const memberAllocations = allocationsByMember.get(member.id)?.filter(a => {
        const aStart = toLocalDateString(a.startDate);
        const aEnd = toLocalDateString(a.endDate);
        return aEnd >= startStr && aStart <= endStr;
      });

      let allocatedHours: number;
      let capacityPercent: number;
      if (memberAllocations && memberAllocations.length > 0) {
        allocatedHours = 0;
        for (const alloc of memberAllocations) {
          allocatedHours += calculateProratedHours(alloc, startStr, endStr, memberHoursPerDay, baseWorkingDays, leaveDates);
        }
        capacityPercent = availableHours > 0 ? Math.round((allocatedHours / availableHours) * 100) : 0;
      } else {
        allocatedHours = availableHours;
        capacityPercent = 100;
      }

      members.push({
        accountId: member.accountId, name: member.name,
        role: member.role as 'qa' | 'engineer', title: member.title,
        workingHoursPerDay: memberHoursPerDay, totalWorkingDays: sprintWorkingDays,
        availableDays, leaveDays, availableHours, allocatedHours, capacityPercent, effectiveMandays,
      });
    }

    result.set(sprint.id, {
      sprintId: sprint.id, sprintName: sprint.name, teamId, teamStandardHours,
      sprintWorkingDays,
      totalCapacityHours: members.reduce((s, m) => s + m.allocatedHours, 0),
      totalAvailableHours: members.reduce((s, m) => s + m.availableHours, 0),
      totalEffectiveMandays: members.reduce((s, m) => s + m.effectiveMandays, 0),
      members,
    });
  }

  return result;
}
