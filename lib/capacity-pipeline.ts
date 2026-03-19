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

/** Count working days in a date range excluding weekends, holidays, and non-dev days */
function countWorkingDays(
  startStr: string,
  endStr: string,
  holidayDates: Set<string>,
  nonDevDates: Set<string>
): number {
  let count = 0;
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const cur = new Date(sy, sm - 1, sd);
  let curStr = startStr;
  while (curStr <= endStr) {
    if (!isWeekend(curStr) && !holidayDates.has(curStr) && !nonDevDates.has(curStr)) {
      count++;
    }
    cur.setDate(cur.getDate() + 1);
    curStr = toLocalDateString(cur);
  }
  return count;
}

/** Count working days for a member (additionally excludes leave) */
function countMemberAvailableDays(
  startStr: string,
  endStr: string,
  holidayDates: Set<string>,
  nonDevDates: Set<string>,
  leaveDates: Set<string>
): { availableDays: number; leaveDays: number } {
  let availableDays = 0;
  let leaveDays = 0;
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const cur = new Date(sy, sm - 1, sd);
  let curStr = startStr;
  while (curStr <= endStr) {
    if (!isWeekend(curStr) && !holidayDates.has(curStr) && !nonDevDates.has(curStr)) {
      if (leaveDates.has(curStr)) {
        leaveDays++;
      } else {
        availableDays++;
      }
    }
    cur.setDate(cur.getDate() + 1);
    curStr = toLocalDateString(cur);
  }
  return { availableDays, leaveDays };
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
  holidayDates: Set<string>,
  nonDevDates: Set<string>,
  leaveDates: Set<string>
): number {
  const allocStartStr = toLocalDateString(allocation.startDate);
  const allocEndStr = toLocalDateString(allocation.endDate);

  // Calculate overlap between allocation and sprint
  const overlapStart = allocStartStr > sprintStartStr ? allocStartStr : sprintStartStr;
  const overlapEnd = allocEndStr < sprintEndStr ? allocEndStr : sprintEndStr;

  if (overlapStart > overlapEnd) return 0; // No overlap

  // Count working days in overlap, excluding leave
  let workingDaysInOverlap = 0;
  const [sy, sm, sd] = overlapStart.split('-').map(Number);
  const cur = new Date(sy, sm - 1, sd);
  let curStr = overlapStart;
  while (curStr <= overlapEnd) {
    if (!isWeekend(curStr) && !holidayDates.has(curStr) && !nonDevDates.has(curStr) && !leaveDates.has(curStr)) {
      workingDaysInOverlap++;
    }
    cur.setDate(cur.getDate() + 1);
    curStr = toLocalDateString(cur);
  }

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
  const sprintWorkingDays = countWorkingDays(sprintStartStr, sprintEndStr, holidayDates, nonDevDates);

  const members: MemberCapacity[] = [];

  for (const member of team.members) {
    const memberHoursPerDay = member.workingHoursPerDay ?? teamStandardHours;
    const leaveDates = memberLeaveMap.get(member.id) || new Set<string>();

    const { availableDays, leaveDays } = countMemberAvailableDays(
      sprintStartStr,
      sprintEndStr,
      holidayDates,
      nonDevDates,
      leaveDates
    );

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
          holidayDates,
          nonDevDates,
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
