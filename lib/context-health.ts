// Data-health checks for the context bar chip. Pure logic here; the API
// route feeds it DB facts. Each check maps to a silent-wrong-numbers class
// this project has actually hit (wrong roles, unseeded holiday year,
// missing DB team, stale roster sync).

export interface HealthInputs {
    teamInDb: boolean;
    engineerCount: number;
    qaCount: number;
    /** Calendar years the sprint touches */
    sprintYears: number[];
    /** Years that have at least one active Holiday row */
    seededYears: number[];
    /** Team.lastSyncedAt, null when never synced or no team */
    lastSyncedAt: Date | null;
    now: Date;
}

export interface HealthCheck {
    id: 'team' | 'roles' | 'holidays' | 'sync';
    ok: boolean;
    label: string;
    hint?: string;
}

export interface HealthResult {
    ok: boolean;
    checks: HealthCheck[];
}

const SYNC_STALE_DAYS = 7;

export function computeHealth(input: HealthInputs): HealthResult {
    const checks: HealthCheck[] = [];

    checks.push(input.teamInDb
        ? { id: 'team', ok: true, label: 'Squad registered in database' }
        : { id: 'team', ok: false, label: 'Squad not in database', hint: 'Sync the squad from Jira in Admin → Squads; capacity falls back to the static roster until then.' });

    if (input.teamInDb) {
        const rolesOk = input.engineerCount > 0 && input.qaCount > 0;
        checks.push(rolesOk
            ? { id: 'roles', ok: true, label: `Roles set (${input.engineerCount} eng, ${input.qaCount} QA)` }
            : {
                id: 'roles', ok: false,
                label: input.qaCount === 0 ? 'No QA members registered' : 'No engineer members registered',
                hint: 'Fix member roles on the squad page — role-split metrics read zero until then.',
            });

        const syncOk = input.lastSyncedAt !== null &&
            (input.now.getTime() - input.lastSyncedAt.getTime()) <= SYNC_STALE_DAYS * 86400_000;
        checks.push(syncOk
            ? { id: 'sync', ok: true, label: 'Roster synced recently' }
            : { id: 'sync', ok: false, label: input.lastSyncedAt ? 'Roster sync older than 7 days' : 'Roster never synced', hint: 'Run squad sync so joiners/leavers are reflected.' });
    }

    const missingYears = input.sprintYears.filter(y => !input.seededYears.includes(y));
    checks.push(missingYears.length === 0
        ? { id: 'holidays', ok: true, label: 'Holidays seeded for this sprint' }
        : { id: 'holidays', ok: false, label: `No holidays for ${missingYears.join(', ')}`, hint: 'Import the year in Settings → Holidays — working days overcount until then.' });

    return { ok: checks.every(c => c.ok), checks };
}
