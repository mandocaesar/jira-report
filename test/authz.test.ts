import { describe, it, expect } from 'vitest';
import { can, SessionUser } from '@/lib/authz';

const user = (role: SessionUser['role'], memberships: Record<string, 'em' | 'lead' | 'viewer'> = {}): SessionUser =>
    ({ id: 'u1', name: 'U', email: 'u@x.com', role, memberships });

describe('can()', () => {
    it('admin can do everything, scoped or not', () => {
        const a = user('admin');
        expect(can(a, 'edit_report', 't1')).toBe(true);
        expect(can(a, 'edit_leave', 't1')).toBe(true);
        expect(can(a, 'manage_roster', 't1')).toBe(true);
        expect(can(a, 'admin_settings')).toBe(true);
        expect(can(a, 'view_audit')).toBe(true);
    });

    it('null user can do nothing', () => {
        expect(can(null, 'edit_report', 't1')).toBe(false);
    });

    it('lead edits report + leave on own squad only', () => {
        const l = user('lead', { t1: 'lead' });
        expect(can(l, 'edit_report', 't1')).toBe(true);
        expect(can(l, 'edit_leave', 't1')).toBe(true);
        expect(can(l, 'edit_report', 't2')).toBe(false);
    });

    it('lead cannot manage roster or settings', () => {
        const l = user('lead', { t1: 'lead' });
        expect(can(l, 'manage_roster', 't1')).toBe(false);
        expect(can(l, 'admin_settings')).toBe(false);
        expect(can(l, 'view_audit')).toBe(false);
    });

    it('em manages roster on own squad, not others', () => {
        const e = user('em', { t1: 'em' });
        expect(can(e, 'manage_roster', 't1')).toBe(true);
        expect(can(e, 'manage_roster', 't2')).toBe(false);
        expect(can(e, 'edit_report', 't1')).toBe(true);
    });

    it('global em role without membership grants nothing squad-scoped', () => {
        const e = user('em');
        expect(can(e, 'edit_report', 't1')).toBe(false);
    });

    it('viewer membership grants no writes', () => {
        const v = user('viewer', { t1: 'viewer' });
        expect(can(v, 'edit_report', 't1')).toBe(false);
        expect(can(v, 'edit_leave', 't1')).toBe(false);
    });

    it('squad-scoped action without teamId is denied for non-admin', () => {
        const e = user('em', { t1: 'em' });
        expect(can(e, 'edit_report')).toBe(false);
    });
});
