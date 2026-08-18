import { describe, it, expect } from 'vitest';
import { buildWorkingDaySet, computeSprintCapacity, CapacityInput } from '@/lib/capacity-engine';

// Sprint Mon 2026-06-15 .. Fri 2026-06-26 = 10 weekdays
const base = (): CapacityInput => ({
  sprintStart: '2026-06-15',
  sprintEnd: '2026-06-26',
  holidayDates: new Set<string>(),
  nonDevDates: new Set<string>(),
  members: [{ accountId: 'a', name: 'A', role: 'engineer', title: 'Associate', excluded: false }],
  leaveDayCounts: new Map(),
  allocations: [],
});

describe('buildWorkingDaySet', () => {
  it('excludes weekends', () => {
    const s = buildWorkingDaySet('2026-06-15', '2026-06-26', new Set(), new Set());
    expect(s.size).toBe(10);
    expect(s.has('2026-06-20')).toBe(false); // Saturday
  });
  it('excludes holidays and non-dev days', () => {
    const s = buildWorkingDaySet('2026-06-15', '2026-06-26',
      new Set(['2026-06-16']), new Set(['2026-06-17']));
    expect(s.size).toBe(8);
  });
  it('holiday on weekend does not double-deduct', () => {
    const s = buildWorkingDaySet('2026-06-15', '2026-06-26', new Set(['2026-06-20']), new Set());
    expect(s.size).toBe(10);
  });
});

describe('computeSprintCapacity', () => {
  it('theoretical = working days − leave', () => {
    const input = base();
    input.leaveDayCounts.set('a', 3);
    const r = computeSprintCapacity(input);
    expect(r.sprintWorkingDays).toBe(10);
    expect(r.members[0].theoreticalMandays).toBe(7);
    expect(r.teamTheoreticalMandays).toBe(7);
  });

  it('leave larger than working days clamps to 0', () => {
    const input = base();
    input.leaveDayCounts.set('a', 15);
    expect(computeSprintCapacity(input).members[0].theoreticalMandays).toBe(0);
  });

  it('excluded member contributes 0', () => {
    const input = base();
    input.members[0].excluded = true;
    const r = computeSprintCapacity(input);
    expect(r.members[0].theoreticalMandays).toBe(0);
    expect(r.teamTheoreticalMandays).toBe(0);
  });

  it('50% allocation over whole sprint halves capacity', () => {
    const input = base();
    input.allocations = [{ accountId: 'a', startDate: '2026-06-15', endDate: '2026-06-26', capacityPercent: 50 }];
    const r = computeSprintCapacity(input);
    expect(r.members[0].allocationFactor).toBeCloseTo(0.5);
    expect(r.members[0].theoreticalMandays).toBe(5);
  });

  it('allocation overlapping half the sprint prorates', () => {
    const input = base();
    // covers first week only: Jun 15-19 = 5 of 10 working days at 100%
    input.allocations = [{ accountId: 'a', startDate: '2026-06-15', endDate: '2026-06-19', capacityPercent: 100 }];
    const r = computeSprintCapacity(input);
    expect(r.members[0].allocationFactor).toBeCloseTo(0.5);
    expect(r.members[0].theoreticalMandays).toBe(5);
  });

  it('no allocations → factor 1', () => {
    expect(computeSprintCapacity(base()).members[0].allocationFactor).toBe(1);
  });

  it('leave applies after allocation factor', () => {
    const input = base();
    input.allocations = [{ accountId: 'a', startDate: '2026-06-15', endDate: '2026-06-26', capacityPercent: 50 }];
    input.leaveDayCounts.set('a', 2);
    // 10 × 0.5 − 2 = 3
    expect(computeSprintCapacity(input).members[0].theoreticalMandays).toBe(3);
  });

  it('negative leave day counts clamp to 0 (legacy -1 sentinel)', () => {
    const input = base();
    input.leaveDayCounts.set('a', -1);
    expect(computeSprintCapacity(input).members[0].theoreticalMandays).toBe(10);
  });
});
