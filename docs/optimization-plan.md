# Unified Optimization Plan — Jira Sprint Report

All optimizations sequenced into 6 dependency-ordered phases. Phase 1 creates shared foundations everything else depends on. Phase 2 fixes algorithmic hotspots (biggest perf wins). Phase 3 removes dead weight. Phase 4 standardizes APIs. Phase 5 eliminates UX duplication. Phase 6 splits oversized components. Each phase is independently verifiable.

---

## Phase 1 — Foundation: Shared Utilities

*No behavioral changes. Enables all later phases. Steps are parallelizable.*

### 1.1 Create `lib/date-utils.ts`
- Extract `generateDateRange()` (duplicated 4× in worklogs, sprint-performance, sprint-performance/history, cron routes)
- Extract `businessDaysBetween()` (duplicated in `lib/metrics-calculator.ts` and `lib/sprint-performance-metrics.ts`)
- Export `forEachDate()` from `lib/holiday-service.ts` for reuse in `lib/capacity-pipeline.ts`
- Consolidate 5 date format functions → `formatDate`, `formatDateShort`, `formatDayName`, `formatDateRange`

### 1.2 Create `lib/ui-colors.ts`
- `getStatusColors()` (duplicated in SprintReport, EpicBreakdown, SprintReportPDF)
- `getCompletionColor()` / `getCompletionBarColor()` / `getCompletionTextColor()` (3 files)
- `getHeatmapColor()` (WorklogReport, SprintReportPDF)
- `workTypeColors` map (SprintSummary, UserUtilizationCard)
- `getUtilColor()` (SprintSummary, UserUtilizationCard, sprint-performance page)
- ~75 lines of duplication eliminated across 8 files

### 1.3 Create `lib/api-helpers.ts`
- `apiSuccess(data, pagination?)` / `apiError(message, status)` response wrappers
- `requireDatabase()` guard (duplicated in 8+ routes)
- `validateParams(searchParams, requiredKeys)` (duplicated pattern in 10+ routes)

### 1.4 Extract `classifyStatus()` to `lib/issue-helpers.ts`
- 3 identical copies in `lib/metrics-calculator.ts`, `lib/sprint-performance-metrics.ts`, and `lib/sprint-report-calculator.ts`

### 1.5 Extract `calculateIssueTimes()` (cycle/lead time) to shared module
- 70+ lines duplicated between `lib/metrics-calculator.ts` and `lib/sprint-performance-metrics.ts`

### 1.6 Build reverse index in `lib/team-roster.ts`
- `getMemberByAccountId()` is O(n×m) — loops all teams × all members per call
- `getTeamByBoardId()` is O(n) per call
- Build `accountIdToMember` Map and `boardIdToTeam` Map once at module load → O(1) lookups

**Verify**: `pnpm run build` + `pnpm run lint` — zero errors, no behavioral change

---

## Phase 2 — Algorithmic: Computation & Memory Hotspots

*Biggest performance gains. Depends on 1.4 and 1.5.*

### 2.1 Single-pass issue categorization in `lib/metrics-calculator.ts` *(depends on 1.4)*
- Lines ~300–328: Three `.filter()` calls on same `issues` array → single `Map<category, JiraIssue[]>` pass
- Lines ~231–415: Five loops over same data → 2 strategic passes
- O(5n) → O(2n), eliminates 3 full array scans

### 2.2 Cache `toLowerCase()` / `classifyStatus()` results *(depends on 1.4)*
- Lines ~31, 52, 235, 246, 355: same status strings processed repeatedly
- Use `Map<string, StatusCategory>` — Jira has ~10 unique statuses, eliminates ~200 redundant string ops

### 2.3 Eliminate duplicate changelog sort
- Line ~94: `getStatusTransitions()` sorts histories by timestamp
- Line ~345: `calculateCycleAndLeadTime()` re-sorts same data + spreads array
- Sort once, pass downstream. Avoid `[...array].sort()` pattern (unnecessary copy)

### 2.4 Merge changelog parsing in `lib/sprint-performance-metrics.ts`
- `isAddedMidSprint()` and `getPointsAtStart()` both traverse `issue.changelog.histories` separately — called per issue in `computeVelocity()` loop
- Each creates `new Date(h.created)` per history entry — 250+ Date objects for 50 issues
- Merge into `analyzeIssueChangelog(issue, sprintStart)` → `{ addedMidSprint, pointsAtStart }` in one pass
- O(2h) → O(h) per issue, Date objects halved

### 2.5 Replace `new Date(str).getTime()` with `Date.parse(str)` in hot loops
- `lib/sprint-report-calculator.ts` lines ~18–41: nested loop `new Date(history.created).getTime()` per history
- `lib/sprint-performance-metrics.ts`: same pattern
- `Date.parse()` returns number directly — no object allocation, no GC pressure
- Eliminates 500+ Date object allocations per sprint calculation

### 2.6 Fix worklog linear search in `app/api/cron/route.ts`
- Lines ~146–206: `member.dailyLogs.find()` inside nested loop — O(n×m×d)
- Build `Map<string, DailyWorklog>` keyed by date first → O(1) lookup
- Same fix in `app/api/sprint-performance/route.ts` and `app/api/worklogs/route.ts`
- Eliminates ~16,800 linear searches in cron route

### 2.7 Single-pass accumulation in `lib/utilization-calculator.ts`
- Lines ~337–343: builds `userUtilizations` array then reduces it for totals — accumulate totals during construction loop
- Lines ~189–310: `aggregateWorkTypeStats` code repeats 3× — extract helper

### 2.8 Pre-compute working day set in `lib/capacity-pipeline.ts`
- `countMemberAvailableDays()` loops all sprint days per member; `calculateProratedHours()` recounts per allocation
- If member has 3 allocations, days counted 4× total
- Compute `Set<string>` of working days once, use intersection for prorated calculations
- O(m×d×a) → O(d + m×a)

**Verify**: `pnpm run build` + compare API response payloads with `curl` + `diff` on `/api/sprint/X?boardId=3816` (must be identical)

---

## Phase 3 — Housekeeping: Dead Code, Redirects, Cache Safety

*Independent of Phase 2. Can run in parallel if different developers.*

### 3.1 Remove dead code
- `findFirstTestTime()` in `lib/metrics-calculator.ts` — defined but never called/exported
- Unused imports left behind after Phase 1–2 extractions

### 3.2 Delete 5 dead redirect pages → move to `next.config.ts` redirects

| Dead Page | Redirects To |
|---|---|
| `app/squads/page.tsx` | `/metrics` |
| `app/squads/[id]/page.tsx` | `/organisation/squads/:id` |
| `app/settings/leave/page.tsx` | `/planning/capacity` |
| `app/settings/team/page.tsx` | `/organisation/squads` |
| `app/reports/team/page.tsx` | `/organisation/squads` |

Add permanent redirects in `next.config.ts`, then delete files + empty directories.

### 3.3 Add cache size limit to `lib/cache.ts`
- Currently unbounded `Map` — memory leak risk
- Lazy expiration only (zombie entries accumulate)
- Add `maxEntries` (default 100), LRU eviction on `set()`, periodic cleanup sweep (every 60s)
- Caps memory at ~20MB regardless of traffic

**Verify**: `pnpm run build` + test all 5 old URLs return 301 redirects + monitor `process.memoryUsage()` under load

---

## Phase 4 — API Routes: Standardization & Performance

*Depends on Phase 1 (api-helpers). Steps are mostly parallelizable.*

### 4.1 Refactor all routes to use `lib/api-helpers.ts` *(depends on 1.3)*
- Standardize response format: `{ success: boolean, data?: T, error?: string }` across 48 routes
- Replace inline DB checks with `requireDatabase()` in 8+ routes
- Replace inline validation with `validateParams()` in 10+ routes

### 4.2 Extract epic breakdown logic to `lib/epic-breakdown-calculator.ts`
- 70+ lines duplicated between `app/api/epic-breakdown/route.ts` and `app/api/cron/route.ts`

### 4.3 Parallelize sequential API calls
- `app/api/squads/route.ts` line ~32: teams processed sequentially → `Promise.all()` with chunking (3–4 concurrent)
- `app/api/sprint-performance/history/route.ts` line ~78: sprints processed sequentially → batch parallel
- Expected: ~15–30s → ~3–5s for squads, ~10–15s → ~3–4s for history

### 4.4 Remove unnecessary changelog fetching
- `app/api/metrics/board/route.ts`: uses `getSprintIssuesWithChangelog()` for all 13 sprints/year when only points needed → use `getSprintIssues()`
- `app/api/team-report/route.ts`: calls both `getSprintIssues()` AND `getSprintIssuesWithChangelog()` for same sprint → deduplicate
- Saves 2.6–3.9MB of wasted Jira data per board/year query

### 4.5 Merge Jira client methods *(depends on 4.4)*
- `getSprintIssues()` and `getSprintIssuesWithChangelog()` in `lib/jira-client.ts` → single `getSprintIssues(sprintId, { includeChangelog? })` with unified cache (if cached with changelog, serve for non-changelog callers too)

### 4.6 Add `Cache-Control` headers to cacheable routes
- `/api/boards` → `max-age=3600`
- `/api/holidays` → `max-age=86400`
- `/api/team-members` → `max-age=300`
- `/api/organisation/structure` → `max-age=3600`

### 4.7 Split oversized routes *(depends on 4.1, 4.2)*
- `app/api/cron/route.ts` (~300 lines) → `route.ts` (orchestration) + `lib/report-generator.ts` + `lib/email-sender.ts`
- `app/api/capacity/route.ts` (~250 lines) → extract PUT/DELETE to `app/api/capacity/[id]/route.ts`

**Verify**: `pnpm run build` + `curl` all major endpoints + time `/api/squads` (should be <5s) + verify cache headers with `curl -I`

---

## Phase 5 — UX: Eliminate Data Presentation Duplication

*Depends on Phase 4 (API standardization). User-visible changes.*

### 5.1 Clarify Sprint Overview vs Sprint Performance page roles
- Remove `EpicBreakdown`, `SprintReport`, and `WorklogReport` component rendering from `app/sprint-performance/page.tsx` — these are already the primary views on Sprint Overview (`/`)
- Sprint Performance keeps its unique content: 8 KPI cards, engineer metrics table (10 columns), non-dev days, capacity allocations, sprint history tab
- Sprint Overview keeps its unique content: timeline, AI summary, scope changes, PDF export, email report
- Reduces Sprint Performance page payload by ~40%, eliminates 3 duplicate API calls

### 5.2 Remove per-member metrics table from Metrics page
- `app/metrics/page.tsx` shows per-member cycle/lead/throughput — same data shown on Squads Detail page
- Replace with "View squad details →" links from squad grid cards to `/organisation/squads/[id]`
- Metrics page focuses on: team scorecard, squad grid overview, velocity overview, AI executive summary, board YTD aggregation

### 5.3 Cross-link leave management pages
- Add "View full leave history →" link in capacity planning leave modal → opens `/organisation/leaves` pre-filtered to that engineer
- Clarifies: capacity = sprint-level adjustments, leaves = HR records

### 5.4 Compute `SprintSummary` aggregates on-demand
- `SprintSummary` type has 14 fields; `qaStats`/`engineerStats` duplicate data from `userUtilizations[]`
- Compute aggregates from the array when needed instead of pre-materializing → ~30% less memory per response

**Verify**: Navigate every sidebar page — all render correctly. Sprint Performance no longer shows epic/report/worklog. Metrics page links to squad detail. Old bookmarked URLs for duplicated views still work.

---

## Phase 6 — Components: Split, Extract, Standardize

*Depends on Phase 1 (ui-colors, format-utils) and Phase 5 (reduced component scope).*

### 6.1 Create shared UI primitives *(depends on 1.2)*

| Component | Replaces | Lines Saved |
|---|---|---|
| `components/ui/Spinner.tsx` | 6+ inline spinner divs | ~30 |
| `components/ui/ErrorAlert.tsx` | 8+ inline error cards | ~64 |
| `components/ui/StatusBadge.tsx` | Status spans in 4+ files | ~40 |
| `components/ui/ProgressBar.tsx` | Progress divs in 5+ files | ~50 |
| `components/ui/KPICard.tsx` | KPI cards in 4+ pages (12+ instances) | ~100 |
| `components/ui/EmptyState.tsx` | "No data" messages in 5+ files | ~25 |

### 6.2 Create `hooks/useFetch.ts` — generic data fetching hook
- Replaces 15+ identical fetch+loading+error state patterns
- `const { data, loading, error } = useFetch<T>(url, deps)`
- ~150 lines of duplication eliminated

### 6.3 Extract Sidebar icons → `components/icons/NavIcons.tsx`
- 17 SVG icons inline in `components/Sidebar.tsx` (lines ~20–133, ~150 lines)
- Extract to separate file, wrap with `React.memo`

### 6.4 Split `components/SprintSummary.tsx` (680 lines) *(depends on 6.1, 6.2)*
- `SprintSummary.tsx` → orchestrator (~100 lines)
- `components/sprint/SprintTimeline.tsx` — progress bar with today marker
- `components/sprint/WorkTypeBreakdown.tsx` — stacked bar + legend pills
- `components/sprint/ScopeChangesSummary.tsx` — hero count + grid (reusable by SprintReport)
- `components/sprint/RoleBreakdownCard.tsx` — engineer/QA card (used 2×)
- `hooks/useAiSummary.ts` — AI generation logic
- `lib/csv-export.ts` — CSV export logic (~40 lines extracted)

### 6.5 Split `components/organisation/MemberReport.tsx` (600 lines)
- `MemberReport.tsx` → overview table (~200 lines)
- `MemberReportDetail.tsx` → individual deep-dive (~300 lines)

### 6.6 Fix `'use client'` markers
- Remove from `components/UserUtilizationCard.tsx` — pure display, no hooks
- Remove from `components/ErrorBoundary.tsx` — class component
- Add `React.memo` to `UserUtilizationCard` (rendered in lists)

### 6.7 Migrate components to use shared utilities *(depends on 6.1, 1.2, 1.1)*
- Replace inline color helpers with imports from `lib/ui-colors.ts` in SprintReport, EpicBreakdown, WorklogReport, SprintReportPDF, UserUtilizationCard, sprint-performance page
- Replace inline date formatters with `lib/format-utils.ts` imports
- Replace inline spinners/errors/badges with `components/ui/*` imports

**Verify**: `pnpm run build` + visually verify all pages look identical (no color/layout regressions) + test PDF export still works

---

## Files Summary

| File | Phase | Action |
|---|---|---|
| `lib/date-utils.ts` | 1.1 | **New** |
| `lib/ui-colors.ts` | 1.2 | **New** |
| `lib/api-helpers.ts` | 1.3 | **New** |
| `lib/format-utils.ts` | 1.1 | **New** |
| `lib/issue-helpers.ts` | 1.4 | Modify — add `classifyStatus()` |
| `lib/team-roster.ts` | 1.6 | Modify — add reverse index Maps |
| `lib/metrics-calculator.ts` | 2.1–2.3 | Modify — single-pass, cache, dedup sort |
| `lib/sprint-performance-metrics.ts` | 2.4–2.5 | Modify — merge changelog parse |
| `lib/sprint-report-calculator.ts` | 2.5 | Modify — `Date.parse()` |
| `lib/utilization-calculator.ts` | 2.7 | Modify — accumulate totals inline |
| `lib/capacity-pipeline.ts` | 2.8 | Modify — pre-compute working days |
| `lib/cache.ts` | 3.3 | Modify — add LRU eviction |
| `lib/jira-client.ts` | 4.5 | Modify — merge methods |
| `lib/epic-breakdown-calculator.ts` | 4.2 | **New** |
| `lib/csv-export.ts` | 6.4 | **New** |
| `next.config.ts` | 3.2 | Modify — add redirects |
| `app/api/cron/route.ts` | 2.6, 4.7 | Modify — fix search, split |
| `app/api/squads/route.ts` | 4.3 | Modify — parallelize |
| `app/api/sprint-performance/history/route.ts` | 4.3 | Modify — parallelize |
| `app/api/metrics/board/route.ts` | 4.4 | Modify — drop changelog |
| `app/api/team-report/route.ts` | 4.4 | Modify — dedup fetch |
| 48 API routes | 4.1 | Modify — use api-helpers |
| `app/sprint-performance/page.tsx` | 5.1 | Modify — remove 3 duplicated components |
| `app/metrics/page.tsx` | 5.2 | Modify — remove member table, add links |
| `app/planning/capacity/page.tsx` | 5.3 | Modify — add leave link |
| 5 dead pages | 3.2 | **Delete** |
| `components/ui/*.tsx` (6 files) | 6.1 | **New** |
| `hooks/useFetch.ts` | 6.2 | **New** |
| `components/icons/NavIcons.tsx` | 6.3 | **New** |
| `components/SprintSummary.tsx` | 6.4 | Split into 5 sub-components |
| `components/organisation/MemberReport.tsx` | 6.5 | Split into 2 |
| `components/Sidebar.tsx` | 6.3 | Modify — import icons |
| 8+ components | 6.7 | Modify — use shared utilities |

---

## Impact Summary

| Metric | Before | After |
|---|---|---|
| Duplicated utility functions | 15+ copies across files | 1 copy each |
| metrics-calculator issue passes | 5 | 2 |
| Date objects per sprint calc | 500+ | ~50 |
| Worklog search (cron) | O(n×m×d) | O(n×m) |
| Team member lookup | O(n×m) | O(1) |
| `/api/squads` response time | ~15–30s | ~3–5s |
| `/api/sprint-performance/history` | ~10–15s | ~3–4s |
| Cron route peak memory | 500MB–1GB | ~250–300MB |
| Jira data fetched (metrics/board) | ~5MB/year | ~2MB/year |
| Cache memory | Unbounded | Capped ~20MB |
| Dead redirect pages | 5 files | 0 (config redirects) |
| Sprint Performance duplicate renders | 3 shared components | 0 |
| Color helper duplicates | 6 functions × 3 copies | 1 module |
| Inline UI pattern copies | ~309 lines | 6 shared components |
| SprintSummary.tsx | 680 lines | ~100 + 5 sub-components |
| Duplicated lines eliminated (est.) | — | ~1,200 lines |

---

## Decisions

- **No new dependencies** — all fixes use native JS/TS (Maps, Sets, single-pass). `useFetch` hook over React Query.
- **Keep both leave pages** — different purposes (sprint planning vs HR). Cross-link instead of merge.
- **Don't merge Sprint Overview + Performance** — different audiences. Remove duplicated sub-components instead.
- **Dead pages → config redirects** — no flash, cleaner builds, preserves bookmarks.
- **Excluded**: Adding tests, DB schema redesign, full server component migration, auth system changes, navigation restructure.
