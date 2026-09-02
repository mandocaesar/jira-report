import { describe, it, expect } from 'vitest';
import { computeHealth, HealthInputs } from '@/lib/context-health';

const base = (): HealthInputs => ({
    teamInDb: true,
    engineerCount: 6,
    qaCount: 1,
    sprintYears: [2026],
    seededYears: [2025, 2026],
    lastSyncedAt: new Date('2026-08-25T00:00:00Z'),
    now: new Date('2026-08-26T00:00:00Z'),
});

describe('computeHealth', () => {
    it('all green when everything is in order', () => {
        const r = computeHealth(base());
        expect(r.ok).toBe(true);
        expect(r.checks.every(c => c.ok)).toBe(true);
    });

    it('flags zero QA members (the 0-QA incident class)', () => {
        const r = computeHealth({ ...base(), qaCount: 0 });
        expect(r.ok).toBe(false);
        expect(r.checks.find(c => c.id === 'roles')!.ok).toBe(false);
        expect(r.checks.find(c => c.id === 'roles')!.label).toMatch(/QA/);
    });

    it('flags unseeded holiday year (the dead-holiday-feed class)', () => {
        const r = computeHealth({ ...base(), sprintYears: [2027], seededYears: [2026] });
        expect(r.checks.find(c => c.id === 'holidays')!.ok).toBe(false);
        expect(r.checks.find(c => c.id === 'holidays')!.label).toContain('2027');
    });

    it('sprint spanning two years needs both seeded', () => {
        const r = computeHealth({ ...base(), sprintYears: [2026, 2027], seededYears: [2026] });
        expect(r.checks.find(c => c.id === 'holidays')!.ok).toBe(false);
    });

    it('missing DB team skips role/sync checks but still reports holidays', () => {
        const r = computeHealth({ ...base(), teamInDb: false });
        expect(r.ok).toBe(false);
        expect(r.checks.find(c => c.id === 'team')!.ok).toBe(false);
        expect(r.checks.some(c => c.id === 'roles')).toBe(false);
        expect(r.checks.some(c => c.id === 'holidays')).toBe(true);
    });

    it('sync older than 7 days is stale; within 7 days is fine', () => {
        const stale = computeHealth({ ...base(), lastSyncedAt: new Date('2026-08-10T00:00:00Z') });
        expect(stale.checks.find(c => c.id === 'sync')!.ok).toBe(false);
        const fresh = computeHealth(base());
        expect(fresh.checks.find(c => c.id === 'sync')!.ok).toBe(true);
    });

    it('never-synced team reports sync check false', () => {
        const r = computeHealth({ ...base(), lastSyncedAt: null });
        expect(r.checks.find(c => c.id === 'sync')!.label).toMatch(/never/i);
    });
});
