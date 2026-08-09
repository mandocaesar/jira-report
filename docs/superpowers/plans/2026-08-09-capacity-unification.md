# Capacity Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One days-only capacity model (theoretical vs assigned mandays, visible ad-hoc buffer) shared by every page, with hours demoted to a per-task accuracy lens.

**Architecture:** Three new pure modules — `capacity-engine` (theoretical mandays from working days/leave/allocations), `sprint-assignment` (assigned-at-start vs added-mid-sprint SP via changelog rollback, buffer/overload), `task-accuracy` (worklog hours vs SP × 6h). Existing `utilization-calculator` keeps only issue aggregation; `capacity-pipeline` hour math and its consumers are rewired. Tripwire tests lock current behavior before any rewrite; captured API fixtures diff before/after.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma 5/PostgreSQL, Vitest (new).

**Spec:** `docs/superpowers/specs/2026-08-09-capacity-unification-design.md`

## Global Constraints

- 1 SP = 1 manday. Capacity and utilization are DAYS-only; hours appear ONLY in task-accuracy outputs.
- `HOURS_PER_MANDAY = 6` — single exported constant in `lib/constants.ts`; the only SP↔hours conversion allowed anywhere.
- Utilization = `assignedAtStart ÷ theoreticalMandays × 100`.
- Buffer = `theoreticalMandays − assignedAtStart`; `overloadSP = max(0, addedDuringSprint − buffer)`.
- Leave source = `SprintLeave` day counts ONLY (`prisma.sprintLeave`). No date-range `Leave` reads, no static-JSON fallback.
- Working days = sprint dates − weekends − active DB holidays − team non-dev days.
- No `TitleAvailableDays` cap. No `ADHOC_DAYS_PER_SPRINT` deduction.
- All date-string parsing UTC: `new Date(s + 'T00:00:00Z')`; date→string via existing `toLocalDateString`.
- Ad-hoc issue detection = existing `isAdhocIssue` (label or `/\bad-?hoc\b/i` summary). Do not change it.
- Excluded members (`excludeFromUtilization`): capacity 0, their SP still counted in team totals.
- Missing worklogs → accuracy ratio `null`, never 0.
- No silent `catch → return []` in DB loaders: log + rethrow so routes return errors.
- Run `npx tsc --noEmit` before every commit; it must pass.

---

### Task 1: Vitest setup + velocity tripwire tests

**Files:**
- Modify: `package.json` (add `test` script, devDeps)
- Create: `vitest.config.ts`
- Create: `test/helpers/issue.ts`
- Test: `test/tripwire/velocity.test.ts`

**Interfaces:**
- Consumes: `computeVelocity(sprint, issues)` from `lib/sprint-performance-metrics.ts` (already exported)
- Produces: `makeIssue(opts)`, `makeSprint(opts)` helpers used by ALL later test tasks (exact signatures below)

- [ ] **Step 1: Install Vitest**

```bash
pnpm add -D vitest @vitest/coverage-v8
```

Add to `package.json` scripts: `"test": "vitest run", "test:watch": "vitest"`.

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname) } },
});
```

- [ ] **Step 2: Write the fixture builders**

Create `test/helpers/issue.ts`:

```ts
import { JiraIssue, Sprint } from '@/types';

export function makeSprint(opts: Partial<Sprint> = {}): Sprint {
  return {
    id: 100,
    name: 'Test Sprint 1',
    state: 'closed',
    startDate: '2026-06-15T03:00:00.000Z',
    endDate: '2026-06-26T10:00:00.000Z',
    ...opts,
  };
}

interface IssueOpts {
  key?: string;
  sp?: number;
  assigneeId?: string | null;
  assigneeName?: string;
  created?: string;            // ISO; default before sprint start
  done?: boolean;
  subtask?: boolean;
  typeName?: string;
  parentKey?: string;
  labels?: string[];
  summary?: string;
  worklogHours?: number[];     // one entry per worklog, all inside sprint
  changelog?: JiraIssue['changelog'];
}

let seq = 0;
export function makeIssue(opts: IssueOpts = {}): JiraIssue {
  seq += 1;
  const assigneeId = opts.assigneeId === undefined ? 'user-1' : opts.assigneeId;
  return {
    id: String(seq),
    key: opts.key ?? `T-${seq}`,
    changelog: opts.changelog,
    fields: {
      summary: opts.summary ?? `Issue ${seq}`,
      labels: opts.labels,
      issuetype: { name: opts.typeName ?? 'Sub-task', subtask: opts.subtask ?? true },
      assignee: assigneeId === null ? null : {
        accountId: assigneeId,
        displayName: opts.assigneeName ?? assigneeId,
        emailAddress: `${assigneeId}@x.com`,
        avatarUrls: { '48x48': '' },
      },
      parent: opts.parentKey ? { id: 'p', key: opts.parentKey, fields: { summary: 'parent' } } : undefined,
      status: { name: opts.done ? 'Done' : 'In Progress', statusCategory: { name: opts.done ? 'Done' : 'In Progress' } },
      worklog: opts.worklogHours ? {
        worklogs: opts.worklogHours.map(h => ({
          author: { accountId: assigneeId ?? 'user-1', displayName: 'x' },
          timeSpentSeconds: h * 3600,
          started: '2026-06-16T02:00:00.000Z',
        })),
      } : undefined,
      created: opts.created ?? '2026-06-01T00:00:00.000Z',
      customfield_10036: opts.sp ?? 0,
    },
  } as JiraIssue;
}

/** Changelog entry adding this issue to the sprint after start */
export function sprintAddedChangelog(sprintId: number, when: string): JiraIssue['changelog'] {
  return {
    histories: [{
      id: 'h1',
      author: { accountId: 'u', displayName: 'u' },
      created: when,
      items: [{ field: 'Sprint', fieldtype: 'jira', fieldId: 'customfield_10020', from: '', fromString: '', to: String(sprintId), toString: `Sprint ${sprintId}` }],
    }],
  };
}

/** Changelog entry changing story points after sprint start */
export function pointsChangedChangelog(when: string, fromPoints: number, toPoints: number): JiraIssue['changelog'] {
  return {
    histories: [{
      id: 'h2',
      author: { accountId: 'u', displayName: 'u' },
      created: when,
      items: [{ field: 'Story point estimate', fieldtype: 'jira', fieldId: 'customfield_10036', from: String(fromPoints), fromString: String(fromPoints), to: String(toPoints), toString: String(toPoints) }],
    }],
  };
}
```

- [ ] **Step 3: Write the velocity tripwire tests**

Create `test/tripwire/velocity.test.ts`:

```ts
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
```

- [ ] **Step 4: Run tests, verify pass against CURRENT code**

Run: `pnpm test`
Expected: 5/5 PASS (these lock existing behavior; if any fails, current understanding is wrong — STOP and report, do not "fix" the production code).

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts test/
git commit -m "test: vitest setup + velocity changelog-rollback tripwires"
```

---

### Task 2: Tripwires — ad-hoc detection, EM report, date utils

**Files:**
- Test: `test/tripwire/adhoc.test.ts`
- Test: `test/tripwire/em-report.test.ts`
- Test: `test/tripwire/dates.test.ts`

**Interfaces:**
- Consumes: `isAdhocIssue`, `computeEmReport`, `computeCarryOverByRole` from `lib/em-report.ts`; `isWeekend`, `toLocalDateString` from `lib/holiday-service.ts`; helpers from Task 1.

- [ ] **Step 1: Write ad-hoc detection tests**

Create `test/tripwire/adhoc.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isAdhocIssue } from '@/lib/em-report';
import { makeIssue } from '../helpers/issue';

describe('isAdhocIssue tripwires', () => {
  it('matches adhoc label case-insensitively', () => {
    expect(isAdhocIssue(makeIssue({ labels: ['AdHoc'] }))).toBe(true);
  });
  it('matches [ADHOC] in summary', () => {
    expect(isAdhocIssue(makeIssue({ summary: '[ADHOC] Sprint 12 support' }))).toBe(true);
  });
  it('matches ad-hoc in summary', () => {
    expect(isAdhocIssue(makeIssue({ summary: 'QA ad-hoc regression run' }))).toBe(true);
  });
  it('does not match adhocracy (word boundary)', () => {
    expect(isAdhocIssue(makeIssue({ summary: 'study adhocracy patterns' }))).toBe(false);
  });
  it('plain issue is not adhoc', () => {
    expect(isAdhocIssue(makeIssue({ summary: 'Implement transfer API' }))).toBe(false);
  });
});
```

- [ ] **Step 2: Write EM report tests**

Create `test/tripwire/em-report.test.ts`:

```ts
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
```

- [ ] **Step 3: Write date util tests (holiday −1 day regression)**

Create `test/tripwire/dates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isWeekend, toLocalDateString } from '@/lib/holiday-service';

describe('date utils tripwires', () => {
  it('isWeekend handles YYYY-MM-DD strings', () => {
    expect(isWeekend('2026-06-20')).toBe(true);  // Saturday
    expect(isWeekend('2026-06-22')).toBe(false); // Monday
  });
  it('UTC-midnight Date round-trips to the same calendar date (holiday shift regression)', () => {
    // DB @db.Date values come back as UTC midnight; must not shift a day
    expect(toLocalDateString(new Date('2026-08-17T00:00:00Z'))).toBe('2026-08-17');
  });
});
```

Note: the round-trip test assumes a UTC-or-positive-offset environment (dev is WIB +7, Vercel is UTC — both safe).

- [ ] **Step 4: Run, verify all pass**

Run: `pnpm test`
Expected: all PASS against current code. Same STOP rule as Task 1 if not.

- [ ] **Step 5: Commit**

```bash
git add test/
git commit -m "test: tripwires for adhoc detection, EM report, date utils"
```

---

### Task 3: API fixture capture (baseline)

**Files:**
- Create: `scripts/capture-fixtures.sh`
- Modify: `.gitignore` (add `test-fixtures/`)

**Interfaces:**
- Produces: `test-fixtures/api/<endpoint>-<sprintId>.json` baseline files used by rewiring tasks (8–10) for before/after diffs.

- [ ] **Step 1: Write the capture script**

Create `scripts/capture-fixtures.sh`:

```bash
#!/usr/bin/env bash
# Captures baseline API responses for capacity-unification diffing.
# Usage: BASE_URL=http://localhost:3000 AUTH_PASSWORD=... ./scripts/capture-fixtures.sh BOARD_ID SPRINT_ID [SPRINT_ID2]
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:3000}"
BOARD_ID="$1"; shift
OUT=test-fixtures/api
mkdir -p "$OUT"
JAR="$(mktemp)"
curl -sf -c "$JAR" -X POST "$BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"password\":\"${AUTH_PASSWORD:?set AUTH_PASSWORD}\"}" > /dev/null

TEAM_ID="$(curl -sf -b "$JAR" "$BASE_URL/api/organisation/squads" | python3 -c "
import json,sys
squads=json.load(sys.stdin)['data']
print(next(s['id'] for s in squads if s.get('boardId')==int('$BOARD_ID')))")"

for SPRINT_ID in "$@"; do
  curl -sf -b "$JAR" "$BASE_URL/api/sprint/$SPRINT_ID?boardId=$BOARD_ID" \
    | python3 -m json.tool > "$OUT/home-sprint-$SPRINT_ID.json"
  curl -sf -b "$JAR" "$BASE_URL/api/sprint-performance?sprintId=$SPRINT_ID&boardId=$BOARD_ID" \
    | python3 -m json.tool > "$OUT/sprint-performance-$SPRINT_ID.json"
  curl -sf -b "$JAR" "$BASE_URL/api/organisation/squads/$TEAM_ID/performance" \
    | python3 -m json.tool > "$OUT/squad-performance-$SPRINT_ID.json"
  echo "captured sprint $SPRINT_ID"
done
```

```bash
chmod +x scripts/capture-fixtures.sh
```

Append `test-fixtures/` to `.gitignore`.

- [ ] **Step 2: Capture baseline**

Dev server must be running (`docker compose up -d`, `pnpm run dev`). Then:

```bash
AUTH_PASSWORD="$(grep '^AUTH_PASSWORD' .env.local | cut -d'=' -f2- | tr -d '"')" \
  ./scripts/capture-fixtures.sh 3816 17676 17677
```

Expected: 6 JSON files in `test-fixtures/api/`. Copy them aside as the baseline:

```bash
cp -r test-fixtures/api test-fixtures/baseline
```

- [ ] **Step 3: Commit (script only — fixtures are gitignored)**

```bash
git add scripts/capture-fixtures.sh .gitignore
git commit -m "test: baseline API fixture capture script"
```

---

### Task 4: Constants + task-accuracy module

**Files:**
- Create: `lib/constants.ts`
- Create: `lib/task-accuracy.ts`
- Test: `test/task-accuracy.test.ts`

**Interfaces:**
- Produces (used by Tasks 8–10):

```ts
// lib/constants.ts
export const HOURS_PER_MANDAY = 6;

// lib/task-accuracy.ts
export interface IssueAccuracy {
  key: string; summary: string;
  assigneeId: string | null; assigneeName: string | null;
  sp: number; expectedHours: number;
  loggedHours: number | null;          // null = no worklogs
  ratio: number | null;                // loggedHours / expectedHours, null if no data or sp=0
}
export interface AccuracyRollup {
  totalSp: number; totalExpectedHours: number; totalLoggedHours: number;
  ratio: number | null; issueCount: number; issuesWithData: number;
}
export interface TaskAccuracyResult {
  issues: IssueAccuracy[];                       // sorted worst ratio first, nulls last
  perMember: Map<string, AccuracyRollup>;        // keyed by assignee accountId
  team: AccuracyRollup;
}
export function computeTaskAccuracy(issues: JiraIssue[]): TaskAccuracyResult;
```

- [ ] **Step 1: Write failing tests**

Create `test/task-accuracy.test.ts`:

```ts
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
```

- [ ] **Step 2: Run, verify FAIL** — `pnpm test test/task-accuracy.test.ts` → module not found.

- [ ] **Step 3: Implement**

Create `lib/constants.ts`:

```ts
/** 1 SP = 1 manday = this many hours. The ONLY SP↔hours conversion in the app. */
export const HOURS_PER_MANDAY = 6;
```

Create `lib/task-accuracy.ts`:

```ts
import { JiraIssue } from '@/types';
import { getStoryPoints } from './issue-helpers';
import { HOURS_PER_MANDAY } from './constants';

export interface IssueAccuracy {
  key: string;
  summary: string;
  assigneeId: string | null;
  assigneeName: string | null;
  sp: number;
  expectedHours: number;
  loggedHours: number | null;
  ratio: number | null;
}

export interface AccuracyRollup {
  totalSp: number;
  totalExpectedHours: number;
  totalLoggedHours: number;
  ratio: number | null;
  issueCount: number;
  issuesWithData: number;
}

export interface TaskAccuracyResult {
  issues: IssueAccuracy[];
  perMember: Map<string, AccuracyRollup>;
  team: AccuracyRollup;
}

function sumWorklogHours(issue: JiraIssue): number | null {
  const logs = issue.fields.worklog?.worklogs;
  if (!logs?.length) return null;
  const seconds = logs.reduce((s, l) => s + (l.timeSpentSeconds || 0), 0);
  return Math.round((seconds / 3600) * 100) / 100;
}

function emptyRollup(): AccuracyRollup {
  return { totalSp: 0, totalExpectedHours: 0, totalLoggedHours: 0, ratio: null, issueCount: 0, issuesWithData: 0 };
}

function addToRollup(r: AccuracyRollup, item: IssueAccuracy) {
  r.issueCount++;
  r.totalSp += item.sp;
  if (item.loggedHours !== null && item.sp > 0) {
    r.issuesWithData++;
    r.totalExpectedHours += item.expectedHours;
    r.totalLoggedHours += item.loggedHours;
  }
}

function finalizeRollup(r: AccuracyRollup) {
  r.ratio = r.totalExpectedHours > 0 ? Math.round((r.totalLoggedHours / r.totalExpectedHours) * 100) / 100 : null;
}

/** Hours-vs-SP accuracy lens. Hours NEVER feed capacity — display only. */
export function computeTaskAccuracy(issues: JiraIssue[]): TaskAccuracyResult {
  const items: IssueAccuracy[] = issues.map(issue => {
    const sp = getStoryPoints(issue);
    const loggedHours = sumWorklogHours(issue);
    const expectedHours = sp * HOURS_PER_MANDAY;
    const ratio = loggedHours !== null && sp > 0
      ? Math.round((loggedHours / expectedHours) * 100) / 100
      : null;
    return {
      key: issue.key,
      summary: issue.fields.summary,
      assigneeId: issue.fields.assignee?.accountId ?? null,
      assigneeName: issue.fields.assignee?.displayName ?? null,
      sp,
      expectedHours,
      loggedHours,
      ratio,
    };
  });

  items.sort((a, b) => {
    if (a.ratio === null && b.ratio === null) return 0;
    if (a.ratio === null) return 1;
    if (b.ratio === null) return -1;
    return b.ratio - a.ratio;
  });

  const perMember = new Map<string, AccuracyRollup>();
  const team = emptyRollup();
  for (const item of items) {
    addToRollup(team, item);
    if (item.assigneeId) {
      if (!perMember.has(item.assigneeId)) perMember.set(item.assigneeId, emptyRollup());
      addToRollup(perMember.get(item.assigneeId)!, item);
    }
  }
  finalizeRollup(team);
  for (const r of perMember.values()) finalizeRollup(r);

  return { issues: items, perMember, team };
}
```

- [ ] **Step 4: Run, verify PASS** — `pnpm test` (all suites) and `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add lib/constants.ts lib/task-accuracy.ts test/task-accuracy.test.ts
git commit -m "feat: task-accuracy module — worklog hours vs SP x 6h expected"
```

---

### Task 5: capacity-engine pure core

**Files:**
- Create: `lib/capacity-engine.ts`
- Test: `test/capacity-engine.test.ts`

**Interfaces:**
- Consumes: `isWeekend`, `toLocalDateString` from `lib/holiday-service.ts`
- Produces (used by Tasks 6–10):

```ts
export interface EngineMember {
  accountId: string; name: string; role: 'engineer' | 'qa'; title: string; excluded: boolean;
}
export interface EngineAllocation {
  accountId: string; startDate: string; endDate: string; capacityPercent: number; // dates YYYY-MM-DD
}
export interface CapacityInput {
  sprintStart: string; sprintEnd: string;   // YYYY-MM-DD
  holidayDates: Set<string>; nonDevDates: Set<string>;
  members: EngineMember[];
  leaveDayCounts: Map<string, number>;      // accountId → days
  allocations: EngineAllocation[];
}
export interface MemberCapacityDays {
  accountId: string; name: string; role: 'engineer' | 'qa'; title: string; excluded: boolean;
  sprintWorkingDays: number; leaveDays: number;
  allocationFactor: number;        // 1 when no allocations
  theoreticalMandays: number;      // 0 if excluded
}
export interface SprintCapacityDays {
  sprintWorkingDays: number;
  members: MemberCapacityDays[];
  teamTheoreticalMandays: number;  // excludes excluded members
}
export function buildWorkingDaySet(start: string, end: string, holidays: Set<string>, nonDev: Set<string>): Set<string>;
export function computeSprintCapacity(input: CapacityInput): SprintCapacityDays;
```

Formula: `theoreticalMandays = max(0, sprintWorkingDays × allocationFactor − leaveDays)`, rounded to 2 decimals. `allocationFactor = Σ(overlapWorkingDays × capacityPercent/100) ÷ sprintWorkingDays` over the member's allocations (factor 1 when none). Excluded member → theoretical 0, leave 0, factor 0.

- [ ] **Step 1: Write failing tests**

Create `test/capacity-engine.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Run, verify FAIL** — module not found.

- [ ] **Step 3: Implement**

Create `lib/capacity-engine.ts`:

```ts
// Days-only capacity engine. NO hours anywhere — hours live in task-accuracy only.
import { isWeekend, toLocalDateString } from './holiday-service';

export interface EngineMember {
  accountId: string;
  name: string;
  role: 'engineer' | 'qa';
  title: string;
  excluded: boolean;
}

export interface EngineAllocation {
  accountId: string;
  startDate: string;
  endDate: string;
  capacityPercent: number;
}

export interface CapacityInput {
  sprintStart: string;
  sprintEnd: string;
  holidayDates: Set<string>;
  nonDevDates: Set<string>;
  members: EngineMember[];
  leaveDayCounts: Map<string, number>;
  allocations: EngineAllocation[];
}

export interface MemberCapacityDays {
  accountId: string;
  name: string;
  role: 'engineer' | 'qa';
  title: string;
  excluded: boolean;
  sprintWorkingDays: number;
  leaveDays: number;
  allocationFactor: number;
  theoreticalMandays: number;
}

export interface SprintCapacityDays {
  sprintWorkingDays: number;
  members: MemberCapacityDays[];
  teamTheoreticalMandays: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildWorkingDaySet(
  start: string,
  end: string,
  holidays: Set<string>,
  nonDev: Set<string>,
): Set<string> {
  const days = new Set<string>();
  const [y, m, d] = start.split('-').map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d));
  let cur = start;
  while (cur <= end) {
    if (!isWeekend(cur) && !holidays.has(cur) && !nonDev.has(cur)) days.add(cur);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    cur = cursor.toISOString().slice(0, 10);
  }
  return days;
}

function allocationFactorFor(
  accountId: string,
  allocations: EngineAllocation[],
  workingDays: Set<string>,
): number {
  const mine = allocations.filter(a => a.accountId === accountId);
  if (mine.length === 0) return 1;
  if (workingDays.size === 0) return 0;
  let allocatedDays = 0;
  for (const alloc of mine) {
    for (const day of workingDays) {
      if (day >= alloc.startDate && day <= alloc.endDate) {
        allocatedDays += alloc.capacityPercent / 100;
      }
    }
  }
  return allocatedDays / workingDays.size;
}

export function computeSprintCapacity(input: CapacityInput): SprintCapacityDays {
  const workingDays = buildWorkingDaySet(
    input.sprintStart, input.sprintEnd, input.holidayDates, input.nonDevDates,
  );
  const sprintWorkingDays = workingDays.size;

  const members: MemberCapacityDays[] = input.members.map(m => {
    if (m.excluded) {
      return { ...m, sprintWorkingDays, leaveDays: 0, allocationFactor: 0, theoreticalMandays: 0 };
    }
    const leaveDays = input.leaveDayCounts.get(m.accountId) ?? 0;
    const allocationFactor = round2(allocationFactorFor(m.accountId, input.allocations, workingDays));
    const theoreticalMandays = round2(Math.max(0, sprintWorkingDays * allocationFactor - leaveDays));
    return { ...m, sprintWorkingDays, leaveDays, allocationFactor, theoreticalMandays };
  });

  return {
    sprintWorkingDays,
    members,
    teamTheoreticalMandays: round2(members.reduce((s, m) => s + m.theoreticalMandays, 0)),
  };
}

export { toLocalDateString };
```

- [ ] **Step 4: Run, verify PASS** — `pnpm test` + `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add lib/capacity-engine.ts test/capacity-engine.test.ts
git commit -m "feat: days-only capacity engine pure core"
```

---

### Task 6: sprint-assignment module (assigned/added/buffer)

**Files:**
- Modify: `lib/sprint-performance-metrics.ts` (export `analyzeIssueChangelog`)
- Create: `lib/sprint-assignment.ts`
- Test: `test/sprint-assignment.test.ts`

**Interfaces:**
- Consumes: `analyzeIssueChangelog(issue, sprint, sprintStartDayEnd)` (make it exported — currently a private function in `lib/sprint-performance-metrics.ts`), `getStoryPoints`, `isAdhocIssue`, `SprintCapacityDays` from Task 5.
- Produces (used by Tasks 8–10):

```ts
export interface MemberAssignment {
  accountId: string;
  assignedAtStart: number;      // SP committed at sprint start
  addedDuringSprint: number;    // SP entering after start
  delivered: number;            // done SP (current values)
  adhocDelivered: number;       // done SP matching isAdhocIssue
  carryOver: number;            // not-done SP
}
export interface AssignmentResult {
  perMember: Map<string, MemberAssignment>;
  team: { assignedAtStart: number; addedDuringSprint: number; delivered: number; adhocDelivered: number; carryOver: number };
}
export function computeAssignment(sprint: Sprint, issues: JiraIssue[]): AssignmentResult;

export interface BufferReport {
  theoreticalMandays: number;
  assignedAtStart: number;
  buffer: number;               // theoretical − assignedAtStart (may be negative)
  addedDuringSprint: number;
  overloadSP: number;           // max(0, added − max(0, buffer))
  verdict: 'fit' | 'overload';
  perMember: Array<{ accountId: string; name: string; theoreticalMandays: number;
                     assignedAtStart: number; buffer: number; addedDuringSprint: number; overloadSP: number }>;
}
export function computeBufferReport(capacity: SprintCapacityDays, assignment: AssignmentResult): BufferReport;
```

- [ ] **Step 1: Export analyzeIssueChangelog**

In `lib/sprint-performance-metrics.ts` change `function analyzeIssueChangelog(` to `export function analyzeIssueChangelog(`. Run `pnpm test` — Task 1 tripwires still pass.

- [ ] **Step 2: Write failing tests**

Create `test/sprint-assignment.test.ts`:

```ts
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
```

- [ ] **Step 3: Run, verify FAIL** — module not found.

- [ ] **Step 4: Implement**

Create `lib/sprint-assignment.ts`:

```ts
// SP-side of the days-only model: who was assigned what at sprint start,
// what got added mid-sprint, and whether additions fit the visible buffer.
import { JiraIssue, Sprint } from '@/types';
import { getStoryPoints } from './issue-helpers';
import { analyzeIssueChangelog } from './sprint-performance-metrics';
import { isAdhocIssue } from './em-report';
import { SprintCapacityDays } from './capacity-engine';

export interface MemberAssignment {
  accountId: string;
  assignedAtStart: number;
  addedDuringSprint: number;
  delivered: number;
  adhocDelivered: number;
  carryOver: number;
}

export interface AssignmentResult {
  perMember: Map<string, MemberAssignment>;
  team: { assignedAtStart: number; addedDuringSprint: number; delivered: number; adhocDelivered: number; carryOver: number };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeAssignment(sprint: Sprint, issues: JiraIssue[]): AssignmentResult {
  const startDayEnd = (() => { const d = new Date(sprint.startDate); d.setHours(23, 59, 59, 999); return d.getTime(); })();
  const perMember = new Map<string, MemberAssignment>();
  const team = { assignedAtStart: 0, addedDuringSprint: 0, delivered: 0, adhocDelivered: 0, carryOver: 0 };

  const entry = (accountId: string): MemberAssignment => {
    if (!perMember.has(accountId)) {
      perMember.set(accountId, { accountId, assignedAtStart: 0, addedDuringSprint: 0, delivered: 0, adhocDelivered: 0, carryOver: 0 });
    }
    return perMember.get(accountId)!;
  };

  for (const issue of issues) {
    const points = getStoryPoints(issue);
    if (points <= 0) continue;
    const accountId = issue.fields.assignee?.accountId ?? 'UNASSIGNED';
    const m = entry(accountId);
    const { addedMidSprint, pointsAtStart } = analyzeIssueChangelog(issue, sprint, startDayEnd);
    const done = issue.fields.status?.statusCategory?.name === 'Done';

    if (addedMidSprint) {
      m.addedDuringSprint += points;
      team.addedDuringSprint += points;
    } else {
      m.assignedAtStart += pointsAtStart;
      team.assignedAtStart += pointsAtStart;
    }
    if (done) {
      m.delivered += points;
      team.delivered += points;
      if (isAdhocIssue(issue)) {
        m.adhocDelivered += points;
        team.adhocDelivered += points;
      }
    } else {
      m.carryOver += points;
      team.carryOver += points;
    }
  }

  for (const m of perMember.values()) {
    m.assignedAtStart = round2(m.assignedAtStart);
    m.addedDuringSprint = round2(m.addedDuringSprint);
    m.delivered = round2(m.delivered);
    m.adhocDelivered = round2(m.adhocDelivered);
    m.carryOver = round2(m.carryOver);
  }
  team.assignedAtStart = round2(team.assignedAtStart);
  team.addedDuringSprint = round2(team.addedDuringSprint);
  team.delivered = round2(team.delivered);
  team.adhocDelivered = round2(team.adhocDelivered);
  team.carryOver = round2(team.carryOver);

  return { perMember, team };
}

export interface BufferReport {
  theoreticalMandays: number;
  assignedAtStart: number;
  buffer: number;
  addedDuringSprint: number;
  overloadSP: number;
  verdict: 'fit' | 'overload';
  perMember: Array<{
    accountId: string; name: string;
    theoreticalMandays: number; assignedAtStart: number;
    buffer: number; addedDuringSprint: number; overloadSP: number;
  }>;
}

export function computeBufferReport(capacity: SprintCapacityDays, assignment: AssignmentResult): BufferReport {
  const memberRows = capacity.members.map(cm => {
    const a = assignment.perMember.get(cm.accountId);
    const assignedAtStart = a?.assignedAtStart ?? 0;
    const addedDuringSprint = a?.addedDuringSprint ?? 0;
    const buffer = round2(cm.theoreticalMandays - assignedAtStart);
    const overloadSP = round2(Math.max(0, addedDuringSprint - Math.max(0, buffer)));
    return {
      accountId: cm.accountId,
      name: cm.name,
      theoreticalMandays: cm.theoreticalMandays,
      assignedAtStart,
      buffer,
      addedDuringSprint,
      overloadSP,
    };
  });

  const theoreticalMandays = capacity.teamTheoreticalMandays;
  const assignedAtStart = assignment.team.assignedAtStart;
  const buffer = round2(theoreticalMandays - assignedAtStart);
  const addedDuringSprint = assignment.team.addedDuringSprint;
  const overloadSP = round2(Math.max(0, addedDuringSprint - Math.max(0, buffer)));

  return {
    theoreticalMandays,
    assignedAtStart,
    buffer,
    addedDuringSprint,
    overloadSP,
    verdict: overloadSP > 0 ? 'overload' : 'fit',
    perMember: memberRows,
  };
}
```

- [ ] **Step 5: Run, verify PASS** — `pnpm test` + `npx tsc --noEmit`.

- [ ] **Step 6: Commit**

```bash
git add lib/sprint-assignment.ts lib/sprint-performance-metrics.ts test/sprint-assignment.test.ts
git commit -m "feat: sprint-assignment module — assigned/added SP, buffer, overload"
```

---

### Task 7: capacity-engine IO loader

**Files:**
- Modify: `lib/capacity-engine.ts` (append loader)

**Interfaces:**
- Consumes: Prisma models `Team`, `TeamMember` (`excludeFromUtilization` field), `SprintLeave`, `CapacityAllocation`, `Holiday`, `NonDevDay`; `Sprint` type.
- Produces (used by Tasks 8–10):

```ts
export interface LoadedCapacity {
  teamId: string;
  input: CapacityInput;
  capacity: SprintCapacityDays;
}
export async function loadSprintCapacity(
  sprint: Sprint,
  by: { teamId?: string; boardId?: number },
): Promise<LoadedCapacity | null>;   // null ONLY when DB unavailable or team not found
```

- [ ] **Step 1: Append the loader to `lib/capacity-engine.ts`**

```ts
import { prisma, isDatabaseAvailable } from './db';
import { Sprint } from '@/types';

export interface LoadedCapacity {
  teamId: string;
  input: CapacityInput;
  capacity: SprintCapacityDays;
}

/**
 * IO shell: load engine inputs from DB and run the pure core.
 * Returns null only when the DB is unavailable or the team is unknown.
 * DB errors are NOT swallowed — they propagate to the route.
 */
export async function loadSprintCapacity(
  sprint: Sprint,
  by: { teamId?: string; boardId?: number },
): Promise<LoadedCapacity | null> {
  if (!isDatabaseAvailable() || !prisma) return null;

  const team = by.teamId
    ? await prisma.team.findUnique({ where: { id: by.teamId }, include: { members: true } })
    : by.boardId !== undefined
      ? await prisma.team.findUnique({ where: { boardId: by.boardId }, include: { members: true } })
      : null;
  if (!team) return null;

  const sprintStart = toLocalDateString(new Date(sprint.startDate));
  const sprintEnd = toLocalDateString(new Date(sprint.endDate));

  const [holidays, nonDev, leaves, allocations] = await Promise.all([
    prisma.holiday.findMany({
      where: {
        isActive: true,
        date: { gte: new Date(sprintStart + 'T00:00:00Z'), lte: new Date(sprintEnd + 'T00:00:00Z') },
      },
      select: { date: true },
    }),
    prisma.nonDevDay.findMany({
      where: { teamId: team.id, sprintId: sprint.id },
      select: { date: true },
    }),
    prisma.sprintLeave.findMany({ where: { sprintId: sprint.id } }),
    prisma.capacityAllocation.findMany({
      where: {
        teamId: team.id,
        type: 'SPRINT',
        startDate: { lte: new Date(sprintEnd + 'T00:00:00Z') },
        endDate: { gte: new Date(sprintStart + 'T00:00:00Z') },
      },
      include: { teamMember: { select: { accountId: true } } },
    }),
  ]);

  const input: CapacityInput = {
    sprintStart,
    sprintEnd,
    holidayDates: new Set(holidays.map(h => toLocalDateString(h.date))),
    nonDevDates: new Set(nonDev.map(n => toLocalDateString(n.date))),
    members: team.members.map(m => ({
      accountId: m.accountId,
      name: m.name,
      role: (m.role === 'qa' ? 'qa' : 'engineer') as 'engineer' | 'qa',
      title: m.title,
      excluded: m.excludeFromUtilization === true,
    })),
    leaveDayCounts: new Map(leaves.map(l => [l.accountId, l.leaveDays])),
    allocations: allocations.map(a => ({
      accountId: a.teamMember.accountId,
      startDate: toLocalDateString(a.startDate),
      endDate: toLocalDateString(a.endDate),
      capacityPercent: a.capacityPercent,
    })),
  };

  return { teamId: team.id, input, capacity: computeSprintCapacity(input) };
}
```

Note: check the actual `TeamMember` field name for exclusion (`excludeFromUtilization`) in `prisma/schema.prisma` before using; if the schema names it differently, use the schema's name.

- [ ] **Step 2: Verify** — `npx tsc --noEmit` passes; `pnpm test` still green (loader has no unit tests — pure core is tested; loader is exercised by Task 8's live check).

- [ ] **Step 3: Commit**

```bash
git add lib/capacity-engine.ts
git commit -m "feat: capacity engine DB loader (SprintLeave day counts, no silent catches)"
```

---

### Task 8: Rewire Home — /api/sprint/[id] + utilization-calculator + summary UI

**Files:**
- Modify: `lib/utilization-calculator.ts`
- Modify: `types/index.ts` (SprintSummary + UserUtilization fields)
- Modify: `components/SprintSummary.tsx`
- Modify: `components/sprint/SprintTimeline.tsx` (no change expected — verify only)

**Interfaces:**
- Consumes: `loadSprintCapacity`, `computeAssignment`, `computeBufferReport`, `computeTaskAccuracy`.
- Produces: extended `SprintSummary` consumed by Home page and PDF/CSV exports:

```ts
// types/index.ts additions to SprintSummary:
buffer?: BufferReport | null;
// UserUtilization: workingDays/leaveDays/availableDays keep names but are now
// engine values; utilizationPercent = assignedAtStart / theoreticalMandays × 100.
```

**Required behavior changes (from spec — fixture diffs will show these and ONLY these):**
1. `totalWorkingDays` may drop when team non-dev days exist (now deducted).
2. Per-member `workingDays` no longer title-capped.
3. `averageUtilization` = teamAssignedAtStart ÷ teamTheoretical × 100 (no −3 adhoc, no hours).
4. New `buffer` object in response.
5. Leave comes only from `prisma.sprintLeave` (no JSON fallback, no `-1` sentinel — exclusion via member flag).

- [ ] **Step 1: Rewrite capacity portion of `calculateSprintUtilization`**

In `lib/utilization-calculator.ts`:
- Delete: `fetchSprintLeaveMap`, `getLeaveDays` helper, `getSprintLeave`/`getAvailableDaysFromMap`/`getTitleDaysMapFromDb` imports and usage, `titleBaseDays` logic, `rawLeaveDays === -1` sentinel, adhoc-days block (`ADHOC_DAYS_PER_SPRINT`, `availableCapacity`), all `availableHours`/`effectiveMandays`/`teamStandardHours` computation.
- Keep: `groupByUser` (issue aggregation, work types, per-issue lists), role stat accumulation, non-roster assignee handling.
- Add at the top of the function:

```ts
const [loaded, assignment] = await Promise.all([
    boardId ? loadSprintCapacity(sprint, { boardId }) : Promise.resolve(null),
    Promise.resolve(computeAssignment(sprint, issues)),
]);
const capacity = loaded?.capacity ?? null;
const capacityByAccount = new Map(capacity?.members.map(m => [m.accountId, m]) ?? []);
```

- Per roster member, replace the old day math with:

```ts
const cap = capacityByAccount.get(member.accountId);
const memberAssign = assignment.perMember.get(member.accountId);
const theoretical = cap?.theoreticalMandays ?? 0;
const assignedAtStart = memberAssign?.assignedAtStart ?? 0;
const utilizationPercent = theoretical > 0 ? (assignedAtStart / theoretical) * 100 : 0;
// UserUtilization mapping:
//   workingDays  = cap?.sprintWorkingDays ?? 0
//   leaveDays    = cap?.leaveDays ?? 0
//   availableDays = theoretical
//   storyPoints  = issueData?.storyPoints || 0   (unchanged — current SP incl. added)
```

- Set legacy hours fields (`workingHoursPerDay`, `teamStandardHours`, `availableHours`, `effectiveMandays`) to keep the type satisfied during transition: `workingHoursPerDay: 0, teamStandardHours: 0, availableHours: 0, effectiveMandays: theoretical`. (Type cleanup happens in Task 11.)
- Team level:

```ts
const buffer = capacity ? computeBufferReport(capacity, assignment) : null;
const averageUtilization = buffer && buffer.theoreticalMandays > 0
    ? (buffer.assignedAtStart / buffer.theoreticalMandays) * 100
    : 0;
```

- Return `buffer` in the summary object; `totalEffectiveMandays = buffer?.theoreticalMandays ?? 0`; `totalWorkingDays = capacity?.sprintWorkingDays ?? <old weekday/holiday calc>` (keep `calculateWorkingDays` fallback for DB-less mode).
- Add `buffer?: BufferReport | null` to `SprintSummary` in `types/index.ts` using `import type { BufferReport } from '@/lib/sprint-assignment'` — MUST be `import type` (lib already imports from types; a value import would create a runtime circular dependency).

- [ ] **Step 2: Update `components/SprintSummary.tsx`**

- Mandays card: value = `summary.buffer?.theoreticalMandays ?? totalMandays`; label "Mandays"; drop `hasHoursVariation` branches (delete the `Eff. Mandays`/`raw days` UI).
- Avg Util tooltip text: `"Average utilization = (Assigned mandays at sprint start ÷ Theoretical mandays) × 100%. Theoretical = working days − holidays − non-dev days − leave."`
- Add buffer line under the timeline row (only when `summary.buffer`):

```tsx
{summary.buffer && (
    <div className="px-2 pb-1">
        <div className={`rounded-lg px-2.5 py-1.5 border text-[11px] flex flex-wrap gap-x-4 gap-y-1 items-center ${summary.buffer.verdict === 'overload' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'}`}>
            <span className="font-semibold uppercase tracking-wider">Ad-hoc Buffer</span>
            <span>{summary.buffer.buffer >= 0 ? `${summary.buffer.buffer} MD unassigned at start` : `${Math.abs(summary.buffer.buffer)} MD over-assigned at start`}</span>
            <span>+{summary.buffer.addedDuringSprint} MD added mid-sprint</span>
            <span className="font-semibold">
                {summary.buffer.verdict === 'overload' ? `Overload +${summary.buffer.overloadSP} MD` : 'Fit within buffer'}
            </span>
        </div>
    </div>
)}
```

- [ ] **Step 3: Verify live + fixture diff**

```bash
npx tsc --noEmit && pnpm test
```

Start dev server, re-capture and diff:

```bash
AUTH_PASSWORD=... ./scripts/capture-fixtures.sh 3816 17676 17677
diff test-fixtures/baseline/home-sprint-17677.json test-fixtures/api/home-sprint-17677.json | head -80
```

Every changed line must trace to behavior changes 1–5 listed above. Anything else = bug; fix before commit. Record the diff summary in the commit message body.

- [ ] **Step 4: Commit**

```bash
git add lib/utilization-calculator.ts types/index.ts components/SprintSummary.tsx
git commit -m "feat: Home sprint overview on days-only capacity engine with buffer readout"
```

---

### Task 9: Rewire /api/sprint-performance + analytics KPI cards

**Files:**
- Modify: `app/api/sprint-performance/route.ts`
- Modify: `lib/sprint-performance-metrics.ts` (`calculateSprintKPIs`, `calculateEngineerMetrics` signatures)
- Modify: `app/analytics/sprint/[id]/page.tsx` (KPI cards — this page consumes the API; `app/sprint-performance/page.tsx` is dead but shares the response type — update its interfaces enough to compile, no behavioral work)

**Interfaces:**
- Consumes: `loadSprintCapacity`, `computeAssignment`, `computeBufferReport`, `computeTaskAccuracy`.
- Produces: new response shape (breaking change is intentional — page updated in same task):

```ts
{
  sprint, velocity,                        // unchanged
  capacityDays: SprintCapacityDays | null, // replaces `capacity` hours object
  buffer: BufferReport | null,             // replaces plannedUtilisation/executionUtilisation cards
  accuracy: {                              // from computeTaskAccuracy
    team: AccuracyRollup;
    worstIssues: IssueAccuracy[];          // top 10 by ratio desc, data-bearing only
  } | null,
  kpis: {                                  // slimmed
    completionRate: number; avgCycleTime: number | null; medianCycleTime: number | null;
  },
  engineerMetrics,                         // storyPoints/completion/cycle kept; hours fields removed
  nonDevDays, allocations, jiraDomain      // unchanged
}
```

- [ ] **Step 1: Slim `calculateSprintKPIs`** — remove `committedHours`, `loggedHours`, `capacityHours`, `plannedUtilisation`, `executionUtilisation`, `execVsCommitment`, `spPerHour`, `avgVelocity` and the `capacity`/`worklogData` params. Keep `completionRate`, `avgCycleTime`, `medianCycleTime`; new signature `calculateSprintKPIs(issues: JiraIssue[])`. Update `SprintPerformanceKPIs` accordingly.

- [ ] **Step 2: Slim `calculateEngineerMetrics`** — remove `availableHours`, `allocatedHours`, `loggedHours`, `capacityPercent`, `plannedUtilisation`, `executionUtilisation` fields and the `capacity`/`worklogData` params; add `theoreticalMandays` and `assignedAtStart` taken from `MemberCapacityDays` + `MemberAssignment` maps passed in: new signature `calculateEngineerMetrics(issues, capacityByAccount: Map<string, MemberCapacityDays>, assignment: AssignmentResult, teamMemberIds: Set<string>)`.

- [ ] **Step 3: Rewire the route** — replace `calculateSprintCapacity` (old pipeline) with `loadSprintCapacity(sprint, { boardId })`; drop `getWorklogData` usage for KPIs (worklogs still fetched with issues — pass issues straight to `computeTaskAccuracy`); assemble the response per the interface above (`worstIssues = accuracy.issues.filter(i => i.ratio !== null).slice(0, 10)`).

- [ ] **Step 4: Update `app/analytics/sprint/[id]/page.tsx`** — replace Planned/Execution/ExecVsCommit/SP-per-hour cards with: Utilization (`buffer.assignedAtStart ÷ buffer.theoreticalMandays`), Buffer (`buffer.buffer` MD + verdict badge), Added Mid-Sprint (`buffer.addedDuringSprint` MD, red when overload), Task Accuracy (`accuracy.team.ratio`, subtitle `${totalLoggedHours}h logged / ${totalExpectedHours}h expected`). Add "Worst estimated tasks" list (key, sp, expected vs logged hours, ratio) under the KPI grid. Fix `app/sprint-performance/page.tsx` types to compile against the new response (minimal edits).

- [ ] **Step 5: Verify + fixture diff**

```bash
npx tsc --noEmit && pnpm test
AUTH_PASSWORD=... ./scripts/capture-fixtures.sh 3816 17676 17677
diff test-fixtures/baseline/sprint-performance-17677.json test-fixtures/api/sprint-performance-17677.json | head -100
```

Expected diffs: hours-KPI fields gone, `capacityDays`/`buffer`/`accuracy` added, engineer metrics slimmed. Anything else = bug.

- [ ] **Step 6: Commit**

```bash
git add app/api/sprint-performance/ lib/sprint-performance-metrics.ts app/analytics/ app/sprint-performance/
git commit -m "feat: sprint-performance on days-only model — buffer + task accuracy replace hour KPIs"
```

---

### Task 10: Rewire squad performance, planning forecast, SprintMetrics writes

**Files:**
- Modify: `app/api/organisation/squads/[id]/performance/route.ts`
- Modify: `app/api/planning/forecast/route.ts`
- Modify: wherever `SprintMetrics` rows are written (grep `sprintMetrics.upsert\|sprintMetrics.create` — currently the metrics snapshot path)
- Modify: `lib/capacity-pipeline.ts` callers — after this task, `calculateSprintCapacity`/`calculateSprintCapacityBatch` from capacity-pipeline must have ZERO remaining callers (grep to confirm)

**Interfaces:**
- Consumes: `loadSprintCapacity`, `computeAssignment`, `computeBufferReport`.
- Produces: same JSON field names where pages already consume them, with day-based values substituted:
  - squad performance: member rows get `theoreticalMandays` (was effectiveMandays), utilization from assigned÷theoretical
  - forecast: `availableMandays = theoreticalMandays` per member (already day-flavored — swap the source)
  - SprintMetrics: `forecastedCapacity`/`actualCapacity` columns now store theoretical mandays (round to int)

- [ ] **Step 1:** Squad performance route: replace old pipeline call with `loadSprintCapacity(sprint, { teamId })`; utilization fields = assigned÷theoretical; keep response field names used by `app/organisation/squads/[id]/page.tsx` (rename only where the page is updated in the same commit).

- [ ] **Step 2:** Forecast route: same swap; member `availableMandays = theoreticalMandays`.

- [ ] **Step 3:** SprintMetrics writes: capacity numbers from the engine.

- [ ] **Step 4:** Grep check:

```bash
grep -rn "calculateSprintCapacity\|calculateSprintCapacityBatch" app/ lib/ --include="*.ts" --include="*.tsx" | grep -v capacity-pipeline.ts | grep -v capacity-engine.ts
```

Expected: no output (old pipeline callers all gone).

- [ ] **Step 5: Verify + fixture diff**

```bash
npx tsc --noEmit && pnpm test
AUTH_PASSWORD=... ./scripts/capture-fixtures.sh 3816 17676 17677
diff test-fixtures/baseline/squad-performance-17677.json test-fixtures/api/squad-performance-17677.json | head -100
```

- [ ] **Step 6: Commit**

```bash
git add app/api/organisation app/api/planning app/organisation lib/
git commit -m "feat: squad performance, forecast, snapshots on capacity engine"
```

---

### Task 11: Deletions, docs, final sweep

**Files:**
- Delete: `app/settings/title-days/page.tsx`, `app/api/settings/title-days/route.ts` (and directory)
- Delete: `app/organisation/leaves/page.tsx`, `app/api/organisation/leaves/route.ts` (and directory)
- Delete: `lib/capacity-pipeline.ts` (engine replaced it — confirm zero imports first)
- Modify: `components/Sidebar.tsx` (remove Title Days + Leaves links)
- Modify: `next.config.ts` (add redirects: `/settings/title-days` → `/settings/holidays`, `/organisation/leaves` → `/planning/capacity`)
- Modify: `lib/team-roster.ts` (delete `getSprintLeave`, `getAvailableDaysByTitle`, `getAvailableDaysFromMap`, `getTitleDaysMapFromDb` if now unreferenced — grep first)
- Modify: `lib/em-report.ts` + `lib/sprint-report-calculator.ts` — replace hardcoded `7` expected-hours with `HOURS_PER_MANDAY` from `lib/constants.ts`
- Modify: `.env.local.example`/CLAUDE.md — remove `ADHOC_DAYS_PER_SPRINT`, `NEXT_PUBLIC_ADHOC_DAYS`
- Modify: `CLAUDE.md` — Key Business Logic section rewritten to days-only model (theoretical vs assigned, buffer, HOURS_PER_MANDAY=6 accuracy lens)

- [ ] **Step 1:** For each deletion target, grep imports first (`grep -rn "capacity-pipeline\|getSprintLeave\|TitleAvailableDays" app/ lib/ components/ --include="*.ts*"`). Delete only what has zero remaining references; if something still references a target, fix that reference first (it is a missed rewiring — report it, don't hack around it).

- [ ] **Step 2:** Replace the SP-accuracy expected hours: in `lib/sprint-report-calculator.ts` find `expectedHoursPerSP` (value 7) and set it from `HOURS_PER_MANDAY`. Update `components/sprint/SpAccuracyTable.tsx` copy if it hardcodes "7".

- [ ] **Step 3:** Env cleanup + CLAUDE.md rewrite of the affected sections (utilization formula, capacity model, ad-hoc, holiday note already updated earlier).

- [ ] **Step 4:** Full verification:

```bash
npx tsc --noEmit && pnpm test && pnpm run build
```

All green. Re-capture fixtures once more; confirm diffs still only intentional.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove title-days cap, adhoc env buffer, legacy capacity pipeline; docs"
```

---

## Verification checklist (final review inputs)

- `pnpm test` — all tripwire + module tests green
- `npx tsc --noEmit`, `pnpm run build` — clean
- Fixture diffs for all 3 endpoints × 2 sprints — every delta maps to a spec-listed intentional change
- Manual: Home + Analytics for Fund Transfer Sprint 12 — same utilization number on both pages; buffer line reads sensibly; task-accuracy list shows real worklog-bearing tasks
- Grep: no references to `ADHOC_DAYS_PER_SPRINT`, `TitleAvailableDays`, `capacity-pipeline`, date-range `prisma.leave` reads in capacity paths
