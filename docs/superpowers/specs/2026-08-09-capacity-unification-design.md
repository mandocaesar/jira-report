# Capacity Unification — Design

**Date:** 2026-08-09
**Status:** Approved
**Goal:** One capacity engine so every page shows the same utilization numbers. Kill the divergence between `lib/utilization-calculator.ts` (Home Sprint Overview) and `lib/capacity-pipeline.ts` (Analytics/planning).

## Problem

Two calculators compute team capacity with different rules, so Home and Analytics disagree for the same sprint:

| Dimension | utilization-calculator (Home) | capacity-pipeline (Analytics) |
|---|---|---|
| Leave data | Legacy `SprintLeave` day counts (+ JSON fallback) | `Leave` date ranges |
| Member base days | Capped by `TitleAvailableDays` per title | Full sprint working days |
| Non-dev days | Ignored | Deducted |
| Capacity adjustments | Ignored | `CapacityAllocation` prorated |
| Ad-hoc | Hidden 3-day env buffer subtracted from capacity | None |
| Utilization | `SP ÷ (effectiveMandays − 3)` | `committedHours ÷ capacityHours` |

## Decisions (user-confirmed)

1. **Title-days cap: delete.** No per-title day limits.
2. **Ad-hoc buffer: delete.** Ad-hoc is visible work identified from Jira issues (label match or `/\bad-?hoc\b/i` in summary — `lib/em-report.ts#isAdhocIssue`), shown as a split, never a hidden capacity deduction.
3. **Leave: day counts win.** `SprintLeave` (member × sprint × N days) is the single leave source. Date-range `Leave` reads are removed; `/organisation/leaves` page is retired.
4. **Non-dev days: deducted everywhere** (previously Analytics-only).
5. **One utilization formula:** Avg Util (SP-based) = `storyPoints ÷ effectiveMandays × 100`, identical on every page. The hour-based KPIs (`plannedUtilisation`, `executionUtilisation`) remain separate, differently-named metrics — but computed from the same engine's capacity numbers, so they can no longer silently disagree on the inputs.

## Architecture

```
lib/capacity-engine.ts
  computeSprintCapacity(input): SprintCapacity     // PURE — no IO, fully unit-tested
    input: {
      sprintStart, sprintEnd,            // YYYY-MM-DD
      holidayDates: Set<string>,
      nonDevDates: Set<string>,
      teamStandardHours: number,
      members: [{ accountId, name, role, title, hoursPerDay?, excluded }],
      leaveDayCounts: Map<accountId, number>,
      allocations: [{ accountId, startDate, endDate, capacityPercent }],
    }
  loadCapacityInputs(sprint, { teamId | boardId }): input   // IO shell — DB reads only
```

- Working days = sprint dates − weekends − active DB holidays − non-dev days
- Member availableDays = workingDays − leaveDayCount (clamped ≥ 0); excluded member → 0
- availableHours = availableDays × memberHours; effectiveMandays = availableHours ÷ teamStandardHours
- Allocations: prorate by date-overlap working days × hours × percent; none → 100%
- `utilization-calculator` keeps issue aggregation only (grouping, per-user SP, work types, role stats); all capacity numbers come from the engine
- All date parsing UTC-safe (`T00:00:00Z`), matching the holiday-shift bugfix convention

## Consumers rewired

`/api/sprint/[id]` (Home), `/api/sprint-performance`, `/api/organisation/squads/[id]/performance`, `/api/planning/forecast`, SprintMetrics snapshot writes.

## Deletions

- `TitleAvailableDays` usage in calculators + `/settings/title-days` page
- `ADHOC_DAYS_PER_SPRINT` / `NEXT_PUBLIC_ADHOC_DAYS` env usage in capacity math
- Date-range `Leave` reads in capacity-pipeline + `/organisation/leaves` page (Prisma model kept for now, dropped in a later migration)
- `getSprintLeave` static-JSON fallback
- Old capacity code paths inside `utilization-calculator`

## Testing strategy

**Runner:** Vitest (`pnpm test`), pure unit tests, no DB/Jira — fixtures only.

**Tripwires — must NOT change (tests written against current behavior first):**
1. Velocity changelog rollback: committed-at-start excludes mid-sprint additions (created-after-start OR sprint-field change); points rolled back via earliest later change `fromString`
2. Issue grouping: parent skipped when sub-tasks present; unassigned skipped; zero-point skipped
3. Working-day math: weekends + active holidays excluded; UTC-safe dates (regression: holiday −1 day bug)
4. Hours normalization: `effectiveMandays = availableDays × memberHours ÷ teamStandardHours`
5. Allocation proration: overlap working days × hours × percent; no allocation = 100%
6. SP accuracy: `expected ÷ actual × 100`, 7h per SP
7. Ad-hoc detection: label OR summary regex
8. EM report: committed→final scope, carry-over = not-done points
9. Excluded members: zero capacity, story points still counted

**Intentional changes — tests assert NEW rule:**
- No title cap; no adhoc buffer; non-dev days deducted in Home numbers; leave from day counts

**Fixture diff harness:** before rewrite, capture live JSON of 3 endpoints (Home sprint, sprint-performance, squad performance) for 2 closed sprints; after each consumer rewiring, diff — every delta must map to an intentional change above.

## Error handling

- Engine is pure — cannot fail on IO; loader returns explicit `null` (no DB) exactly like today's pipeline, callers keep existing degraded behavior
- No silent catch-and-return-empty in the loader: DB errors log + propagate to route error responses (lesson from the dead-holiday-API incident)

## Rollout

1. Vitest installed; tripwire tests green on current code
2. Capture fixture responses (2 closed sprints × 3 endpoints)
3. Build engine pure core + new-rule tests
4. Rewire consumers one endpoint at a time; run fixture diff after each
5. Update tooltips (utilization formula), CLAUDE.md
6. Manual eyeball: Home + Analytics for a sprint the team knows by heart

## Out of scope

- Dropping `Leave` / `TitleAvailableDays` Prisma models (later migration)
- Snapshot-closed-sprints performance work (separate finding)
- Data-health strip (separate finding)
- Competency/skills UI (parked)
