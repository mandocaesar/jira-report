import { describe, it, expect } from 'vitest';
import { computeAssignment, computeBufferReport } from '@/lib/sprint-assignment';
import { SprintCapacityDays } from '@/lib/capacity-engine';
import { makeSprint, makeIssue, pointsChangedChangelog } from './helpers/issue';

const sprint = makeSprint();

describe('computeAssignment', () => {
  it('splits assigned-at-start vs added per member', () => {
    const r = computeAssignment(sprint, [
      makeIssue({ assigneeId: 'a', sp: 5 }),
      makeIssue({ assigneeId: 'a', sp: 3, created: '2026-06-18T04:00:00.000Z' }),
      makeIssue({ assigneeId: 'b', sp: 2, done: true }),
    ]);
    expect(r.perMember.get('a')!.assignedAtStart).toBe(5);
    expect(r.perMember.get('a')!.addedDuringSprint).toBe(3);
    expect(r.perMember.get('b')!.assignedAtStart).toBe(2);
    expect(r.team.assignedAtStart).toBe(7);
    expect(r.team.addedDuringSprint).toBe(3);
  });

  it('tracks delivered, adhoc-delivered and carry-over', () => {
    const r = computeAssignment(sprint, [
      makeIssue({ assigneeId: 'a', sp: 2, done: true, summary: '[ADHOC] support' }),
      makeIssue({ assigneeId: 'a', sp: 4, done: true }),
      makeIssue({ assigneeId: 'a', sp: 1, done: false }),
    ]);
    const a = r.perMember.get('a')!;
    expect(a.delivered).toBe(6);
    expect(a.adhocDelivered).toBe(2);
    expect(a.carryOver).toBe(1);
  });

  it('unassigned issues aggregate under UNASSIGNED', () => {
    const r = computeAssignment(sprint, [makeIssue({ assigneeId: null, sp: 3 })]);
    expect(r.perMember.get('UNASSIGNED')!.assignedAtStart).toBe(3);
  });

  it('points rolled back for assigned-at-start when changed mid-sprint', () => {
    const r = computeAssignment(sprint, [
      makeIssue({ assigneeId: 'a', sp: 8, changelog: pointsChangedChangelog('2026-06-19T04:00:00.000Z', 3, 8) }),
    ]);
    expect(r.perMember.get('a')!.assignedAtStart).toBe(3);
  });

  it('skips parent issues whose sub-tasks are in the sprint (no double count)', () => {
    const r = computeAssignment(sprint, [
      makeIssue({ key: 'PARENT', sp: 5, subtask: false, assigneeId: 'a' }),
      makeIssue({ key: 'SUB', sp: 3, subtask: true, parentKey: 'PARENT', assigneeId: 'a' }),
    ]);
    expect(r.perMember.get('a')!.assignedAtStart).toBe(3); // parent skipped
  });
});

describe('computeBufferReport', () => {
  const capacity: SprintCapacityDays = {
    sprintWorkingDays: 10,
    teamTheoreticalMandays: 18,
    members: [
      { accountId: 'a', name: 'A', role: 'engineer', title: 't', excluded: false, sprintWorkingDays: 10, leaveDays: 0, allocationFactor: 1, theoreticalMandays: 10 },
      { accountId: 'b', name: 'B', role: 'engineer', title: 't', excluded: false, sprintWorkingDays: 10, leaveDays: 2, allocationFactor: 1, theoreticalMandays: 8 },
    ],
  };

  it('additions fit inside buffer → fit', () => {
    const assignment = computeAssignment(sprint, [
      makeIssue({ assigneeId: 'a', sp: 7 }),
      makeIssue({ assigneeId: 'b', sp: 6 }),
      makeIssue({ assigneeId: 'a', sp: 3, created: '2026-06-18T04:00:00.000Z' }),
    ]);
    const b = computeBufferReport(capacity, assignment);
    expect(b.assignedAtStart).toBe(13);
    expect(b.buffer).toBe(5);            // 18 − 13
    expect(b.addedDuringSprint).toBe(3);
    expect(b.overloadSP).toBe(0);
    expect(b.verdict).toBe('fit');
  });

  it('additions beyond buffer → overload with amount', () => {
    const assignment = computeAssignment(sprint, [
      makeIssue({ assigneeId: 'a', sp: 10 }),
      makeIssue({ assigneeId: 'b', sp: 7 }),
      makeIssue({ assigneeId: 'a', sp: 4, created: '2026-06-18T04:00:00.000Z' }),
    ]);
    const b = computeBufferReport(capacity, assignment);
    expect(b.buffer).toBe(1);            // 18 − 17
    expect(b.overloadSP).toBe(3);        // 4 added − 1 buffer
    expect(b.verdict).toBe('overload');
  });

  it('per-member rows carry member-level buffer and overload', () => {
    const assignment = computeAssignment(sprint, [
      makeIssue({ assigneeId: 'a', sp: 9 }),
      makeIssue({ assigneeId: 'a', sp: 3, created: '2026-06-18T04:00:00.000Z' }),
    ]);
    const row = computeBufferReport(capacity, assignment).perMember.find(m => m.accountId === 'a')!;
    expect(row.buffer).toBe(1);          // 10 − 9
    expect(row.overloadSP).toBe(2);      // 3 − 1
  });
});
