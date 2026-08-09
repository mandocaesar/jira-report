# Capacity Unification — Design

**Date:** 2026-08-09
**Status:** Approved (rev 3 — days-only capacity model)
**Goal:** One capacity engine so every page shows the same numbers. Kill the divergence between `lib/utilization-calculator.ts` (Home Sprint Overview) and `lib/capacity-pipeline.ts` (Analytics/planning).

## Problem

Two calculators compute team capacity with different rules, so Home and Analytics disagree for the same sprint:

| Dimension | utilization-calculator (Home) | capacity-pipeline (Analytics) |
|---|---|---|
| Leave data | Legacy `SprintLeave` day counts (+ JSON fallback) | `Leave` date ranges |
| Member base days | Capped by `TitleAvailableDays` per title | Full sprint working days |
| Non-dev days | Ignored | Deducted |
| Capacity adjustments | Ignored | `CapacityAllocation` prorated |
| Ad-hoc | Hidden 3-day env buffer subtracted from capacity | None |
| Unit | Mix of days and hours | Hours |

## Core model (user-confirmed)

**Capacity is measured in mandays. Hours exist only as a task-accuracy lens.**

1. **Theoretical mandays** (per member) = sprint working days − weekends − active DB holidays − team non-dev days − that member's leave day-count, scaled by allocation % for part-time assignment (`CapacityAllocation` overlap). Excluded members (EMs) → 0.
2. **Assigned mandays at start** = SP committed to that member at sprint start (1 SP = 1 manday; changelog rollback identifies start-of-sprint scope).
3. **Ad-hoc buffer** = theoretical − assigned-at-start (per member and team). This is capacity deliberately left open; it is *visible*, never an env-var deduction.
4. **Added during sprint** = SP entering the sprint after start, attributed per member. Sprint-end question the engine must answer: did additions fit inside the start buffer (`added ≤ buffer`, "used as-is") or exceed it (`added > buffer`, overload — by how much, and who absorbed it)?
5. **Hours = accuracy only.** Expected effort for a task = `SP × HOURS_PER_MANDAY (6)`. Worklog hours logged on the task vs expected → per-task accuracy ("1 SP task actually took 9h"), rolled up per member and team. Hours NEVER feed capacity or utilization. Member `workingHoursPerDay` is dropped from capacity math entirely.

## Decisions

1. **Title-days cap: delete.** No per-title day limits (`TitleAvailableDays` unused).
2. **Hidden ad-hoc env buffer: delete.** `ADHOC_DAYS_PER_SPRINT` gone; buffer is the observable assigned-vs-theoretical gap. Ad-hoc *work* is identified from Jira issues (label or `/\bad-?hoc\b/i` summary — `lib/em-report.ts#isAdhocIssue`) and shown as a split.
3. **Leave: day counts win.** `SprintLeave` (member × sprint × N days) is the single leave source. Date-range `Leave` reads removed; `/organisation/leaves` page retired.
4. **Non-dev days: deducted everywhere** (previously Analytics-only).
5. **Utilization** = `assigned mandays ÷ theoretical mandays × 100` — same formula, days-only, every page. Hour-based `plannedUtilisation`/`executionUtilisation` KPIs are **removed** (they mixed hours into capacity); replaced by the buffer/overload readout.
6. **`HOURS_PER_MANDAY = 6`** — single exported constant, used ONLY by the accuracy module (expected hours per task).

## Architecture

```
lib/capacity-engine.ts                     // days only
  computeSprintCapacity(input): SprintCapacity          // PURE — no IO
    input: {
      sprintStart, sprintEnd,              // YYYY-MM-DD
      holidayDates: Set<string>,
      nonDevDates: Set<string>,
      members: [{ accountId, name, role, title, excluded }],
      leaveDayCounts: Map<accountId, number>,
      allocations: [{ accountId, startDate, endDate, capacityPercent }],
    }
    output per member: { theoreticalMandays, leaveDays, allocationFactor }
  loadCapacityInputs(sprint, { teamId | boardId }): input   // IO shell — DB reads only

lib/sprint-assignment.ts                   // SP-side, pure
  computeAssignment(sprint, issues, members): {
    perMember: { assignedAtStart, addedDuringSprint, deliveredSP, adhocSP },
    team totals + buffer readout: { buffer = theoretical − assignedAtStart,
                                    bufferUsedByAdditions, overloadSP }
  }   // reuses computeVelocity changelog rollback + isAdhocIssue

lib/task-accuracy.ts                       // hours lens, pure
  computeTaskAccuracy(issues): {
    perIssue: { key, sp, expectedHours = sp × 6, loggedHours, ratio },
    perMember + team rollups
  }
```

- `utilization-calculator` keeps issue aggregation only (grouping, work types, role stats); capacity/assignment numbers come from the modules above
- All date parsing UTC-safe (`T00:00:00Z`), matching the holiday-shift bugfix convention

## Consumers rewired

`/api/sprint/[id]` (Home), `/api/sprint-performance`, `/api/organisation/squads/[id]/performance`, `/api/planning/forecast`, SprintMetrics snapshot writes.

UI changes:
- Home summary: Mandays card = theoretical; Avg Util = assigned ÷ theoretical; new buffer line ("12 MD unassigned at start, 9 MD added mid-sprint → fit in buffer")
- Analytics KPIs: planned/execution utilisation cards replaced by buffer/overload + task-accuracy cards
- EM report: unchanged columns, now fed by shared modules
- SP accuracy table: expected hours change 7 → 6 per SP; add per-task drill-down (worst offenders list)

## Deletions

- `TitleAvailableDays` usage + `/settings/title-days` page
- `ADHOC_DAYS_PER_SPRINT` / `NEXT_PUBLIC_ADHOC_DAYS` env usage
- Date-range `Leave` reads + `/organisation/leaves` page (Prisma model kept, dropped in later migration)
- `getSprintLeave` static-JSON fallback
- `workingHoursPerDay` from capacity math (column kept on models for now, ignored)
- Hour-based capacity KPIs (`committedHours`, `capacityHours`, `plannedUtilisation`, `executionUtilisation`)

## Testing strategy

**Runner:** Vitest (`pnpm test`), pure unit tests, fixtures only — no DB/Jira.

**Tripwires — must NOT change (tests written against current behavior first):**
1. Velocity changelog rollback: committed-at-start excludes mid-sprint additions (created-after-start OR sprint-field change); points rolled back via earliest later change `fromString`
2. Issue grouping: parent skipped when sub-tasks present; unassigned skipped; zero-point skipped
3. Working-day math: weekends + active holidays excluded; UTC-safe dates (regression: holiday −1 day bug)
4. Ad-hoc detection: label OR summary regex
5. EM report: committed→final scope, carry-over = not-done points
6. Excluded members: zero capacity, story points still counted

**Intentional changes — tests assert NEW rule:**
- Days-only capacity: theoretical mandays = working days − leave, × allocation %; no hours anywhere
- No title cap; no adhoc env buffer; non-dev days deducted in Home numbers; leave from day counts
- Buffer/overload: `buffer = theoretical − assignedAtStart`; `overloadSP = max(0, added − buffer)` with per-member attribution
- Task accuracy: `expectedHours = SP × 6`; ratio = logged ÷ expected

**Fixture diff harness:** before rewrite, capture live JSON of 3 endpoints (Home sprint, sprint-performance, squad performance) for 2 closed sprints; after each consumer rewiring, diff — every delta must map to an intentional change above.

## Error handling

- Pure modules cannot fail on IO; loader returns explicit `null` (no DB) like today's pipeline, callers keep degraded behavior
- No silent catch-and-return-empty in the loader: DB errors log + propagate to route error responses (lesson from the dead-holiday-API incident)
- Missing worklogs on a task → accuracy ratio `null` (shown as "no data"), never treated as 0h

## Rollout

1. Vitest installed; tripwire tests green on current code
2. Capture fixture responses (2 closed sprints × 3 endpoints)
3. Build pure modules (capacity-engine, sprint-assignment, task-accuracy) + new-rule tests
4. Rewire consumers one endpoint at a time; run fixture diff after each
5. Update tooltips (new formulas), CLAUDE.md
6. Manual eyeball: Home + Analytics for a sprint the team knows by heart

## Out of scope

- Dropping `Leave` / `TitleAvailableDays` Prisma models (later migration)
- Snapshot-closed-sprints performance work (separate finding)
- Data-health strip (separate finding)
- Competency/skills UI (parked)
