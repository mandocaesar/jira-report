import { describe, it, expect } from 'vitest';
import { computeVelocity } from '@/lib/sprint-performance-metrics';
import { makeSprint, makeIssue, sprintAddedChangelog, pointsChangedChangelog } from '../helpers/issue';

const sprint = makeSprint(); // starts 2026-06-15

describe('computeVelocity — changelog rollback tripwires', () => {
  it('counts issues existing at start as committed', () => {
    const v = computeVelocity(sprint, [makeIssue({ sp: 5 }), makeIssue({ sp: 3, done: true })]);
    expect(v.committedPoints).toBe(8);
    expect(v.actualPoints).toBe(3);
    expect(v.addedMidSprintPoints).toBe(0);
  });

  it('issue created after sprint start-day is added-mid-sprint, not committed', () => {
    const v = computeVelocity(sprint, [makeIssue({ sp: 5, created: '2026-06-17T04:00:00.000Z' })]);
    expect(v.committedPoints).toBe(0);
    expect(v.addedMidSprintPoints).toBe(5);
    expect(v.addedMidSprintCount).toBe(1);
  });

  it('issue moved into sprint after start (changelog) is added-mid-sprint', () => {
    const v = computeVelocity(sprint, [makeIssue({
      sp: 4,
      changelog: sprintAddedChangelog(sprint.id, '2026-06-18T04:00:00.000Z'),
    })]);
    expect(v.committedPoints).toBe(0);
    expect(v.addedMidSprintPoints).toBe(4);
  });

  it('points changed mid-sprint roll back to start value for committed', () => {
    const v = computeVelocity(sprint, [makeIssue({
      sp: 8,
      changelog: pointsChangedChangelog('2026-06-19T04:00:00.000Z', 3, 8),
    })]);
    expect(v.committedPoints).toBe(3);  // start value
    expect(v.totalPoints).toBe(8);     // current value
  });

  it('done issues added mid-sprint count toward actual but not committed', () => {
    const v = computeVelocity(sprint, [makeIssue({ sp: 2, done: true, created: '2026-06-20T04:00:00.000Z' })]);
    expect(v.actualPoints).toBe(2);
    expect(v.committedPoints).toBe(0);
  });
});
