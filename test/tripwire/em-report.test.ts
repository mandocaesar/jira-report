import { describe, it, expect } from 'vitest';
import { computeEmReport } from '@/lib/em-report';
import { makeSprint, makeIssue } from '../helpers/issue';

const sprint = makeSprint();
const roleMap = new Map<string, 'engineer' | 'qa'>([['eng-1', 'engineer'], ['qa-1', 'qa']]);
const counts = { engineer: 1, qa: 1 } as const;

describe('computeEmReport tripwires', () => {
  it('committedStart -> committedFinal reflects mid-sprint additions', () => {
    const rows = computeEmReport(sprint, [
      makeIssue({ assigneeId: 'eng-1', sp: 5, done: true }),
      makeIssue({ assigneeId: 'eng-1', sp: 3, done: true, created: '2026-06-18T04:00:00.000Z' }),
    ], roleMap, { ...counts }).rows;
    const eng = rows.find(r => r.role === 'engineer')!;
    expect(eng.committedStart).toBe(5);
    expect(eng.committedFinal).toBe(8);
    expect(eng.deliveredTotal).toBe(8);
  });

  it('carry-over = not-done points with issue refs', () => {
    const rows = computeEmReport(sprint, [
      makeIssue({ assigneeId: 'qa-1', sp: 4, done: false, key: 'T-CO' }),
    ], roleMap, { ...counts }).rows;
    const qa = rows.find(r => r.role === 'qa')!;
    expect(qa.carryOverPoints).toBe(4);
    expect(qa.carryOverIssues[0].key).toBe('T-CO');
  });

  it('unknown assignee defaults to engineer row', () => {
    const rows = computeEmReport(sprint, [
      makeIssue({ assigneeId: 'stranger', sp: 2, done: true }),
    ], roleMap, { ...counts }).rows;
    expect(rows.find(r => r.role === 'engineer')!.deliveredTotal).toBe(2);
  });
});
