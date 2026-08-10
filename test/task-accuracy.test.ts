import { describe, it, expect } from 'vitest';
import { computeTaskAccuracy } from '@/lib/task-accuracy';
import { HOURS_PER_MANDAY } from '@/lib/constants';
import { makeIssue } from './helpers/issue';

describe('computeTaskAccuracy', () => {
  it('expectedHours = sp × HOURS_PER_MANDAY', () => {
    const r = computeTaskAccuracy([makeIssue({ sp: 2, worklogHours: [6, 6] })]);
    expect(r.issues[0].expectedHours).toBe(2 * HOURS_PER_MANDAY);
    expect(r.issues[0].loggedHours).toBe(12);
    expect(r.issues[0].ratio).toBeCloseTo(1.0);
  });

  it('no worklogs → loggedHours and ratio are null, never 0', () => {
    const r = computeTaskAccuracy([makeIssue({ sp: 1 })]);
    expect(r.issues[0].loggedHours).toBeNull();
    expect(r.issues[0].ratio).toBeNull();
  });

  it('sp=0 issue → ratio null even with worklogs', () => {
    const r = computeTaskAccuracy([makeIssue({ sp: 0, worklogHours: [3] })]);
    expect(r.issues[0].ratio).toBeNull();
  });

  it('sorts worst ratio first, null-ratio issues last', () => {
    const r = computeTaskAccuracy([
      makeIssue({ key: 'OK', sp: 1, worklogHours: [6] }),     // ratio 1.0
      makeIssue({ key: 'BAD', sp: 1, worklogHours: [18] }),   // ratio 3.0
      makeIssue({ key: 'NODATA', sp: 1 }),
    ]);
    expect(r.issues.map(i => i.key)).toEqual(['BAD', 'OK', 'NODATA']);
  });

  it('team rollup sums only issues with data for ratio', () => {
    const r = computeTaskAccuracy([
      makeIssue({ sp: 1, worklogHours: [12] }),  // 12h vs 6h
      makeIssue({ sp: 1 }),                       // no data
    ]);
    expect(r.team.totalLoggedHours).toBe(12);
    expect(r.team.issuesWithData).toBe(1);
    expect(r.team.ratio).toBeCloseTo(2.0);   // 12 / 6 over issues WITH data
  });

  it('perMember rollup keyed by assignee', () => {
    const r = computeTaskAccuracy([
      makeIssue({ assigneeId: 'a', sp: 1, worklogHours: [6] }),
      makeIssue({ assigneeId: 'b', sp: 2, worklogHours: [6] }),
    ]);
    expect(r.perMember.get('a')!.ratio).toBeCloseTo(1.0);
    expect(r.perMember.get('b')!.ratio).toBeCloseTo(0.5);
  });
});
